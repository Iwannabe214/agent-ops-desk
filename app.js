const STORAGE_KEY = "agentops-desk-demo-v10-guided-operations";
const LEGACY_STORAGE_KEYS = ["agentops-desk-demo-v9-process-integrity", "agentops-desk-demo-v8-application-health"];
const PAGE_SIZE = 10;

const ticketCategories = ["账号权限", "用户操作", "Agent配置", "知识库", "输出质量", "平台故障", "需求建议"];
const ticketStatuses = ["待确认", "已复现", "处理中", "待验证", "已关闭"];
const slaHoursByPriority = { P0: 0.25, P1: 2, P2: 24, P3: 48 };
const responseChannels = ["用户微信群", "用户私聊", "反馈表单", "内部咨询", "其他渠道"];
const ticketTransitionRules = {
  "待确认": ["待确认", "已复现", "处理中"],
  "已复现": ["已复现", "处理中"],
  "处理中": ["处理中", "待验证"],
  "待验证": ["待验证", "处理中", "已关闭"],
  "已关闭": ["已关闭"]
};
const reviewDimensions = [
  { key: "scenario", label: "场景完整性", max: 15, rubric: "13–15：用户、任务、输入输出和边界明确；9–12：主场景明确但边界不完整；0–8：场景模糊。" },
  { key: "functionality", label: "功能可用性", max: 20, rubric: "17–20：主流程与关键工具稳定；12–16：主流程可用但有少量失败；0–11：核心流程无法稳定完成。" },
  { key: "exception", label: "异常处理", max: 15, rubric: "13–15：超时、空结果和工具失败均有明确兜底；9–12：有部分提示；0–8：失败后无解释或替代方案。" },
  { key: "output", label: "输出质量", max: 15, rubric: "13–15：准确、完整且可核验；9–12：偶有遗漏；0–8：存在明显错误、编造或格式不稳定。" },
  { key: "knowledge", label: "知识库质量", max: 10, rubric: "9–10：来源权威、版本清晰且命中稳定；6–8：基本可用但有缺口；0–5：来源不明、过期或经常未命中。" },
  { key: "security", label: "安全和隐私", max: 15, rubric: "13–15：权限、脱敏和危险操作确认完整；9–12：低风险缺口；0–8：存在越权、泄露或不可控操作。" },
  { key: "readiness", label: "运营准备", max: 10, rubric: "9–10：负责人、指引、监控和下架预案齐全；6–8：缺少一项；0–5：上线后无人负责或无使用说明。" }
];
const vetoOptions = ["隐私或权限越权风险", "持续编造关键数据", "危险操作缺少人工确认", "没有异常兜底"];
const pageTitles = {
  dashboard: "运营总览",
  accounts: "账号开通",
  applications: "应用审核",
  tickets: "问题闭环",
  analytics: "数据周报",
  faq: "FAQ管理",
  audit: "操作日志",
  guide: "使用指南"
};

let demoRandomSeed = 20260822;

function resetDemoRandom(seed = 20260822) {
  demoRandomSeed = seed >>> 0;
}

function demoRandom() {
  demoRandomSeed = (demoRandomSeed * 1664525 + 1013904223) >>> 0;
  return demoRandomSeed / 4294967296;
}

function isoDaysAgo(days, hour = 9, minute = 30) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function localDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shortDate(days = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDate(date);
}

function randomInt(min, max) {
  return Math.floor(demoRandom() * (max - min + 1)) + min;
}

function pick(items) {
  return items[randomInt(0, items.length - 1)];
}

function addHours(value, hours) {
  return new Date(new Date(value).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function getReviewScore(application) {
  if (!application.reviewScores) return null;
  return reviewDimensions.reduce((sum, dimension) => sum + Number(application.reviewScores[dimension.key] || 0), 0);
}

function incrementVersion(version = "V1.0") {
  const match = /^V(\d+)\.(\d+)$/.exec(version);
  if (!match) return "V1.1";
  return `V${match[1]}.${Number(match[2]) + 1}`;
}

function getSlaStatus(ticket, now = new Date()) {
  const dueAt = new Date(ticket.slaDueAt);
  if (ticket.firstResponseAt) {
    const breached = new Date(ticket.firstResponseAt) > dueAt;
    return { label: breached ? "超时" : "达标", className: breached ? "sla-overdue" : "sla-ok", breached, eligible: true };
  }
  const overdue = now > dueAt;
  return { label: overdue ? "已超时" : "待响应", className: overdue ? "sla-overdue" : "sla-pending", breached: overdue, eligible: overdue };
}

function getCollaborationDefaults(ticket) {
  const collaboratorByCategory = {
    "账号权限": "技术-陈工",
    "用户操作": "产品-周宁",
    "Agent配置": "产品-周宁",
    "知识库": "产品-周宁",
    "输出质量": "产品-周宁",
    "平台故障": "技术-陈工",
    "需求建议": "产品-周宁"
  };
  let collaborator = collaboratorByCategory[ticket.category] || "产品-周宁";
  if (collaborator === ticket.owner) collaborator = ticket.owner === "技术-陈工" ? "产品-周宁" : "技术-陈工";
  return { collaborator, department: collaborator.split("-")[0] };
}

function getCategoryBlocker(category) {
  const blockers = {
    "账号权限": "等待核对角色与资源授权记录",
    "用户操作": "等待确认引导文案与入口位置",
    "Agent配置": "等待补充意图样本并完成回归测试",
    "知识库": "等待确认文档版本与索引更新结果",
    "输出质量": "等待补充失败样本和输出约束",
    "平台故障": "等待技术日志定位与修复排期",
    "需求建议": "等待产品评估价值、范围和优先级"
  };
  return blockers[category] || "等待责任人确认处理方案";
}

function generateMetrics(days = 60) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - index));
    const weekday = date.getDay();
    const weekendFactor = weekday === 0 || weekday === 6 ? 0.72 : 1;
    const trend = index * 0.9;
    const calls = Math.max(36, Math.round((72 + trend + randomInt(-20, 28)) * weekendFactor));
    const activeUsers = Math.max(7, Math.round(calls / randomInt(5, 8)));
    return { date: localDate(date), calls, activeUsers };
  });
}

function refreshApplicationMetrics(applications, metrics) {
  const totalCalls = metrics.reduce((sum, item) => sum + item.calls, 0);
  const statusFactor = { "已上架": 1, "已通过": 0.42, "待审核": 0.08, "待整改": 0.12, "已下架": 0.45, "已驳回": 0.05 };
  applications.forEach((item, index) => {
    const baseWeight = 0.045 + (applications.length - index) * 0.008;
    item.callVolume = Math.max(8, Math.round(totalCalls * baseWeight * (statusFactor[item.status] ?? 0.15)));
    item.successRate = Math.min(0.995, 0.84 + item.passRate / 700 - (item.risk === "高" ? 0.035 : 0));
    item.negativeRate = Math.max(0.006, 0.055 - item.passRate / 2300 + (item.risk === "高" ? 0.018 : 0));
    item.responseSeconds = Math.round((1.2 + index * 0.18 + (item.type === "Agent" ? 0.35 : 0)) * 10) / 10;
    item.kbMissRate = item.type === "Agent" ? Math.max(0.01, 0.12 - item.passRate / 1100) : null;
    item.manualInterventions = Math.max(0, Math.round(item.callVolume * item.negativeRate * 0.2));
  });
}

function getApplicationHealth(application) {
  if (["已驳回", "已下架"].includes(application.status)) return { label: "停止使用", tone: "muted", action: "保留记录，复盘后决定是否重提" };
  if (["待审核", "待整改"].includes(application.status)) return { label: application.status, tone: "pending", action: application.status === "待整改" ? "完成整改后重新审核" : "完成发布前评分与风险检查" };
  if (application.risk === "高" || application.successRate < 0.93 || application.negativeRate > 0.03) return { label: "重点整改", tone: "risk", action: "检查失败样本、权限边界和异常兜底" };
  if (application.kbMissRate !== null && application.kbMissRate > 0.045) return { label: "优化知识库", tone: "warning", action: "补充未命中文档并执行回归测试" };
  return { label: "运行健康", tone: "healthy", action: "保持监控，关注负反馈和响应波动" };
}

function createSeedData() {
  resetDemoRandom();
  const accounts = [
      { id: "ACC-001", name: "林晓", department: "客户成功部", purpose: "试用客户服务Agent并整理常见问题", role: "普通用户", submittedAt: isoDaysAgo(0, 8, 45), status: "待审核" },
      { id: "ACC-002", name: "陈航", department: "市场部", purpose: "使用营销文案Skill", role: "普通用户", submittedAt: isoDaysAgo(0, 9, 10), status: "待审核" },
      { id: "ACC-003", name: "周宁", department: "产品部", purpose: "维护内部产品知识助手", role: "应用管理员", submittedAt: isoDaysAgo(1, 15, 20), status: "已开通" },
      { id: "ACC-004", name: "苏晴", department: "财务部", purpose: "体验费用分析Agent", role: "普通用户", submittedAt: isoDaysAgo(2, 11, 0), status: "已驳回" },
      { id: "ACC-005", name: "王川", department: "研发部", purpose: "调试工具调用与应用日志", role: "开发者", submittedAt: isoDaysAgo(3, 16, 35), status: "已开通" }
  ];
  const names = ["赵妍", "刘博", "郭晨", "何雨", "郑扬", "蒋欣", "唐伟", "谢琳", "冯凯", "罗静", "许成", "宋佳", "韩旭", "邓琪", "曹越"];
  const departments = ["市场部", "销售部", "人力资源部", "产品部", "客户成功部", "研发部", "运营部"];
  const purposes = ["体验内部知识问答", "使用会议纪要Skill", "测试客户反馈分类", "生成活动复盘初稿", "验证表格分析工作流", "维护部门知识库", "试用营销内容助手"];
  names.forEach((name, index) => accounts.push({
    id: `ACC-${String(index + 6).padStart(3, "0")}`,
    name,
    department: pick(departments),
    purpose: pick(purposes),
    role: pick(["普通用户", "普通用户", "普通用户", "开发者", "应用管理员"]),
    submittedAt: isoDaysAgo(randomInt(4, 59), randomInt(8, 17), randomInt(0, 59)),
    status: pick(["已开通", "已开通", "已开通", "已驳回", "待审核"])
  }));

  accounts.forEach((account, index) => {
    account.resourceScope = account.role === "应用管理员" ? "指定工作空间及应用管理" : account.role === "开发者" ? "开发调试环境与应用日志" : "指定应用使用权限";
    account.accessExpiry = account.status === "已开通" ? shortDate(90 + index * 3) : "";
    account.approvalComment = account.status === "已开通"
      ? "申请用途明确，按最小权限原则开通指定范围。"
      : account.status === "已驳回" ? "申请用途或权限范围不够明确，需要补充后重新申请。" : "待核验用途、资源范围和权限期限。";
    account.processedAt = account.status === "待审核" ? "" : addHours(account.submittedAt, randomInt(2, 24));
  });

  const applications = [
      { id: "APP-001", name: "客户反馈归类助手", type: "Agent", owner: "周宁", scenario: "将用户反馈分类并提取优先级建议", passRate: 93, risk: "低", status: "已上架" },
      { id: "APP-002", name: "合同风险摘要", type: "Skill", owner: "苏晴", scenario: "总结合同条款并提示需人工复核", passRate: 78, risk: "高", status: "待审核" },
      { id: "APP-003", name: "运营周报生成器", type: "Agent", owner: "林晓", scenario: "根据结构化指标生成周报初稿", passRate: 88, risk: "中", status: "待审核" },
      { id: "APP-004", name: "产品知识问答", type: "Agent", owner: "周宁", scenario: "根据产品文档回答内部使用问题", passRate: 96, risk: "低", status: "已通过" },
      { id: "APP-005", name: "外部网页抓取", type: "Skill", owner: "王川", scenario: "抓取指定网页并提取文本", passRate: 64, risk: "高", status: "已驳回" }
  ];
  const appSamples = [
    ["会议纪要整理", "Agent", "何雨", "将会议记录整理为决议和待办"],
    ["销售话术检查", "Skill", "赵妍", "检查销售话术是否遗漏必要信息"],
    ["需求文档分析", "Agent", "邓琪", "提取需求要点并生成结构化摘要"],
    ["表格异常检测", "Skill", "郭晨", "识别运营表格中的缺失值和异常波动"],
    ["新员工入职助手", "Agent", "韩旭", "根据制度和流程回答入职问题"],
    ["活动复盘助手", "Agent", "宋佳", "根据活动数据生成复盘框架"],
    ["敏感信息检查", "Skill", "谢琳", "标记文本中的个人信息和密钥风险"]
  ];
  appSamples.forEach((sample, index) => applications.push({
    id: `APP-${String(index + 6).padStart(3, "0")}`,
    name: sample[0], type: sample[1], owner: sample[2], scenario: sample[3],
    passRate: randomInt(72, 98), risk: pick(["低", "低", "中", "高"]),
    status: pick(["已上架", "已上架", "已通过", "已下架", "已驳回"])
  }));

  const tickets = [
      { id: "ISS-001", user: "U013", title: "知识助手引用了旧版本产品价格", description: "用户发现回答仍引用上季度价格说明。", category: "知识库", priority: "P1", owner: "运营-小林", status: "处理中", createdAt: isoDaysAgo(2, 10, 20), nextUpdate: shortDate(0), resolution: "准备替换旧文档并重建索引" },
      { id: "ISS-002", user: "U008", title: "新用户不知道从哪里创建Agent", description: "首次登录后缺少清晰入口提示。", category: "用户操作", priority: "P2", owner: "运营-小林", status: "待验证", createdAt: isoDaysAgo(3, 14, 10), nextUpdate: shortDate(1), resolution: "已新增首屏引导并更新FAQ" },
      { id: "ISS-003", user: "U021", title: "工作流调用工具连续超时", description: "下午高峰期连续三次执行失败。", category: "平台故障", priority: "P0", owner: "技术-陈工", status: "已复现", createdAt: isoDaysAgo(0, 10, 5), nextUpdate: shortDate(0), resolution: "已收集日志，等待技术定位" },
      { id: "ISS-004", user: "U005", title: "周报生成器自动补充了不存在的数据", description: "缺少指标时模型使用推测数值。", category: "输出质量", priority: "P1", owner: "产品-周宁", status: "处理中", createdAt: isoDaysAgo(1, 16, 25), nextUpdate: shortDate(0), resolution: "增加禁止推测和缺失字段提示" },
      { id: "ISS-005", user: "U018", title: "申请普通账号后看不到知识库", description: "账号已开通，但资源权限未分配。", category: "账号权限", priority: "P2", owner: "运营-小林", status: "已关闭", createdAt: isoDaysAgo(5, 9, 15), nextUpdate: "-", resolution: "补充分组授权并回访确认" },
      { id: "ISS-006", user: "U011", title: "文档切片后表格字段错位", description: "Markdown表格导入后检索内容顺序混乱。", category: "知识库", priority: "P2", owner: "产品-周宁", status: "待确认", createdAt: isoDaysAgo(0, 11, 40), nextUpdate: shortDate(1), resolution: "待补充原始文档与复现步骤" },
      { id: "ISS-007", user: "U003", title: "希望增加对话结果批量导出", description: "用户需要用于月度复盘。", category: "需求建议", priority: "P3", owner: "产品-周宁", status: "待确认", createdAt: isoDaysAgo(4, 13, 20), nextUpdate: shortDate(3), resolution: "进入需求评估池" },
      { id: "ISS-008", user: "U016", title: "Agent未识别‘报表’与‘周报’为相同意图", description: "导致工作流进入错误分支。", category: "Agent配置", priority: "P2", owner: "产品-周宁", status: "已关闭", createdAt: isoDaysAgo(6, 15, 10), nextUpdate: "-", resolution: "补充意图示例并完成10条回归测试" },
      { id: "ISS-009", user: "U027", title: "登录后反复跳转到授权页", description: "单个用户持续出现，尚未确认是否为浏览器缓存。", category: "账号权限", priority: "P2", owner: "运营-小林", status: "待确认", createdAt: isoDaysAgo(0, 13, 0), nextUpdate: shortDate(1), resolution: "待收集浏览器版本和录屏" }
  ];
  const issueSamples = [
    ["账号权限", "新成员无法访问已授权应用", "成员已加入工作空间但资源仍不可见。"],
    ["用户操作", "用户找不到对话历史导出入口", "操作入口层级较深，首次使用未找到。"],
    ["Agent配置", "意图路由将售后咨询分到销售流程", "相似表达样本不足导致分类错误。"],
    ["知识库", "制度更新后仍检索到旧条款", "旧文档未停用，多个版本同时参与召回。"],
    ["输出质量", "摘要遗漏原文中的关键限制条件", "长文档处理时遗漏末尾约束。"],
    ["平台故障", "高峰期应用响应时间明显增加", "部分会话超过预期响应时间。"],
    ["需求建议", "希望增加问题处理结果订阅", "用户希望状态变化时自动收到提醒。"],
    ["用户操作", "新用户误把调试记录当作正式数据", "界面未清晰区分调试和生产日志。"],
    ["知识库", "上传PDF后部分页面未被识别", "扫描页面未完成文字识别。"],
    ["输出质量", "回答格式在多轮对话后发生变化", "上下文增加后未继续遵循输出模板。"]
  ];
  for (let index = 9; index < 30; index += 1) {
    const sample = issueSamples[(index - 9) % issueSamples.length];
    const status = pick(["待确认", "已复现", "处理中", "待验证", "已关闭", "已关闭"]);
    const priority = sample[0] === "平台故障" ? pick(["P1", "P1", "P2"]) : pick(["P1", "P2", "P2", "P2", "P3"]);
    tickets.push({
      id: `ISS-${String(index + 1).padStart(3, "0")}`,
      user: `U${String(randomInt(28, 86)).padStart(3, "0")}`,
      title: `${sample[1]}（${index - 8}）`, description: sample[2], category: sample[0], priority,
      owner: pick(["运营-小林", "运营-小林", "产品-周宁", "技术-陈工"]), status,
      createdAt: isoDaysAgo(randomInt(7, 59), randomInt(8, 18), randomInt(0, 59)),
      nextUpdate: status === "已关闭" ? "-" : shortDate(randomInt(0, 4)),
      resolution: status === "已关闭" ? "已完成处理、回归验证并反馈用户" : "已记录，按优先级持续跟进"
    });
  }

  applications.forEach((application, index) => {
    const qualityOffset = Math.round((application.passRate - 80) / 10);
    application.version = `V1.${index % 4}`;
    application.submittedAt = isoDaysAgo(randomInt(1, 58), randomInt(8, 17), randomInt(0, 59));
    application.testCaseCount = randomInt(18, 48);
    application.failureEvidence = "已记录失败样本、触发条件和人工复核结果。";
    application.knowledgeSource = application.type === "Agent" ? "脱敏业务文档与已确认FAQ" : "结构化输入与规则说明";
    application.fallbackPlan = "工具失败或结果不确定时停止自动执行，提示用户转人工处理。";
    application.privacyNotes = "仅使用脱敏测试数据，按最小权限访问必要资源。";
    application.guideStatus = ["已上架", "已通过"].includes(application.status) ? "已完成使用指引" : "已提交初稿，待审核";
    application.reviewHistory = [];
    application.reviewedAt = "";
    if (application.status === "待审核") {
      application.reviewScores = null;
      application.vetoes = [];
      application.reviewComment = "待完成发布前审核。";
      return;
    }
    application.reviewScores = {
      scenario: Math.min(15, Math.max(8, randomInt(11, 15) + qualityOffset)),
      functionality: Math.min(20, Math.max(10, randomInt(14, 20) + qualityOffset)),
      exception: Math.min(15, Math.max(7, randomInt(10, 15) + qualityOffset)),
      output: Math.min(15, Math.max(7, randomInt(10, 15) + qualityOffset)),
      knowledge: Math.min(10, Math.max(5, randomInt(7, 10) + qualityOffset)),
      security: Math.min(15, Math.max(7, randomInt(11, 15) - (application.risk === "高" ? 3 : 0))),
      readiness: Math.min(10, Math.max(5, randomInt(7, 10)))
    };
    application.vetoes = application.id === "APP-005"
      ? ["危险操作缺少人工确认"]
      : application.status === "已驳回" ? ["没有异常兜底"] : [];
    application.reviewComment = application.vetoes.length
      ? "存在一票否决风险，需要补充权限控制、人工确认和失败兜底后复审。"
      : "已完成场景、功能、输出质量和运营准备检查。";
    const reviewScore = getReviewScore(application);
    if (application.vetoes.length || reviewScore < 70) application.status = "已驳回";
    else if (reviewScore < 85) application.status = "待整改";
    application.reviewedAt = addHours(application.submittedAt, randomInt(2, 30));
    application.reviewHistory.push({
      version: application.version,
      reviewedAt: application.reviewedAt,
      score: reviewScore,
      result: application.status,
      vetoes: [...application.vetoes],
      comment: application.reviewComment
    });
  });

  const knowledgeHealthSample = applications.find(application => application.id === "APP-001");
  if (knowledgeHealthSample) {
    knowledgeHealthSample.passRate = 82;
    knowledgeHealthSample.reviewComment = "已通过发布审核；运营监控发现知识库未命中率偏高，需要补充资料并持续回归。";
  }

  const agentNames = ["产品知识问答", "客户反馈归类助手", "运营周报生成器", "新员工入职助手"];
  tickets.forEach((ticket, index) => {
    const slaHours = slaHoursByPriority[ticket.priority];
    const responseHours = index % 7 === 0 ? slaHours * 1.5 : Math.max(0.08, slaHours * (0.25 + demoRandom() * 0.55));
    ticket.application = agentNames[index % agentNames.length];
    ticket.appVersion = `V1.${index % 4}`;
    ticket.actualResult = ticket.description;
    ticket.expectedResult = `用户能够正常完成任务，并获得符合当前规则的结果。`;
    ticket.reproduction = `1. 使用${ticket.application}；2. 输入与用户相同或相近的问题；3. 对比实际结果与预期结果。`;
    ticket.impactScope = ticket.priority === "P0" ? "可能影响全部用户" : ticket.priority === "P1" ? "可能影响多个用户" : "当前确认影响1至3名用户";
    ticket.initialCause = ticket.category === "知识库" ? "初步判断与文档版本、切片或检索配置有关。" : ticket.category === "账号权限" ? "初步判断与角色或资源授权有关。" : "已完成基础排查，仍需结合日志或配置进一步确认。";
    ticket.verification = ticket.status === "已关闭" ? "使用原问题及相似问题完成回归测试，未再次复现。" : "待处理完成后使用原问题回归测试。";
    ticket.userFeedback = ticket.status === "已关闭" ? "已向原反馈用户同步，用户确认恢复。" : "尚未完成最终结果反馈。";
    ticket.slaDueAt = addHours(ticket.createdAt, slaHours);
    const waitingForResponse = ["ISS-006", "ISS-009"].includes(ticket.id);
    ticket.firstResponseAt = waitingForResponse ? "" : addHours(ticket.createdAt, responseHours);
    ticket.slaBreached = waitingForResponse ? null : new Date(ticket.firstResponseAt) > new Date(ticket.slaDueAt);
    ticket.closedAt = "";
    const collaboration = getCollaborationDefaults(ticket);
    ticket.collaborationDepartment = collaboration.department;
    ticket.collaborator = collaboration.collaborator;
    ticket.responseChannel = ticket.firstResponseAt ? pick(responseChannels.slice(0, 4)) : "";
    ticket.responseContent = ticket.firstResponseAt ? `已收到“${ticket.title}”，正在核对影响范围并协调${ticket.collaborationDepartment}定位，预计${ticket.nextUpdate}前同步下一次进展。` : "";
    ticket.initialAssessment = ticket.firstResponseAt ? ticket.initialCause : "";
    ticket.escalatedTo = ticket.firstResponseAt ? ticket.collaborator : "";
    ticket.blocker = ticket.status === "已关闭" ? "无，已完成验证与用户反馈" : getCategoryBlocker(ticket.category);
    ticket.commitmentDate = ticket.status === "已关闭" ? "-" : (index % 8 === 0 ? shortDate(-1) : ticket.nextUpdate);
    ticket.nextAction = ticket.status === "已关闭" ? "将处理结果沉淀为FAQ或复盘材料" : ticket.resolution;
    const firstFollowUpAt = ticket.firstResponseAt || addHours(ticket.createdAt, Math.min(1, slaHours / 2));
    ticket.followUps = [{
      id: crypto.randomUUID(),
      at: firstFollowUpAt,
      from: "运营-小林",
      to: ticket.collaborator,
      action: "提交问题背景、影响范围和复现信息",
      result: ticket.firstResponseAt ? "协作方已接收，进入定位或方案评估" : "已登记，等待协作方首次确认",
      nextStep: ticket.nextAction,
      commitmentDate: ticket.commitmentDate
    }];
    let latestProgressAt = firstFollowUpAt;
    if (["处理中", "待验证", "已关闭"].includes(ticket.status)) {
      latestProgressAt = addHours(ticket.createdAt, Math.min(18, Math.max(2, slaHours + 1)));
      ticket.followUps.push({
        id: crypto.randomUUID(),
        at: latestProgressAt,
        from: ticket.collaborator,
        to: "运营-小林",
        action: "反馈定位结论与处理进度",
        result: ticket.status === "已关闭" ? "已完成处理并提供验证说明" : "已明确初步原因，按承诺时间继续处理",
        nextStep: ticket.status === "待验证" ? "请运营复测并回访用户" : ticket.nextAction,
        commitmentDate: ticket.commitmentDate
      });
    }
    if (ticket.status === "已关闭") {
      const proposedClosedAt = addHours(ticket.createdAt, randomInt(8, 72));
      ticket.closedAt = new Date(Math.max(new Date(proposedClosedAt).getTime(), new Date(latestProgressAt).getTime() + 3600000)).toISOString();
      ticket.followUps.push({
        id: crypto.randomUUID(),
        at: ticket.closedAt,
        from: "运营-小林",
        to: ticket.collaborator,
        action: "完成回归验证并同步用户",
        result: ticket.userFeedback,
        nextStep: "评估是否沉淀FAQ并纳入周报",
        commitmentDate: "-"
      });
    }
    ticket.followUps.sort((a, b) => new Date(a.at) - new Date(b.at));
    ticket.lastFollowUpAt = ticket.followUps.at(-1)?.at || ticket.createdAt;
  });

  const metrics = generateMetrics(60);
  refreshApplicationMetrics(applications, metrics);

  return {
    accounts,
    applications,
    tickets,
    metrics,
    faqs: [
      { id: "FAQ-001", category: "账号权限", question: "账号已经开通，为什么仍看不到指定应用？", answer: "账号开通与资源授权是两个步骤。请提供匿名用户编号和应用名称，由管理员核对所属工作空间及资源权限。", updatedAt: shortDate(-1), sourceIssue: "ISS-005" },
      { id: "FAQ-002", category: "用户操作", question: "第一次登录后如何创建Agent？", answer: "进入工作空间后选择“创建应用”，先填写场景和任务边界，再配置模型、知识库或工作流。", updatedAt: shortDate(0), sourceIssue: "-" },
      { id: "FAQ-003", category: "输出质量", question: "AI生成的周报数据可以直接使用吗？", answer: "不可以。需要与原始指标表、平台日志或人工台账核对；缺失数据应明确标注，不允许推测补充。", updatedAt: shortDate(-2), sourceIssue: "-" },
      { id: "FAQ-004", category: "问题反馈", question: "反馈问题时需要提供哪些信息？", answer: "请提供发生时间、匿名用户编号、应用版本、操作步骤、实际结果、预期结果及必要的脱敏截图。", updatedAt: shortDate(-3), sourceIssue: "-" }
    ],
    audit: [
      { id: crypto.randomUUID(), at: isoDaysAgo(0, 13, 5), action: "登记用户问题", detail: "新增 ISS-009：登录后反复跳转到授权页" },
      { id: crypto.randomUUID(), at: isoDaysAgo(0, 11, 45), action: "登记用户问题", detail: "新增 ISS-006：Markdown表格切片错位" },
      { id: crypto.randomUUID(), at: isoDaysAgo(1, 17, 10), action: "应用审核通过", detail: "APP-004 产品知识问答完成发布前审核" },
      { id: crypto.randomUUID(), at: isoDaysAgo(2, 14, 30), action: "问题状态更新", detail: "ISS-002 已完成新手引导优化，进入待验证" },
      { id: crypto.randomUUID(), at: isoDaysAgo(3, 10, 20), action: "账号开通", detail: "ACC-003 已开通应用管理员权限" },
      { id: crypto.randomUUID(), at: isoDaysAgo(4, 16, 0), action: "应用驳回", detail: "APP-005 因风险边界与失败兜底不足被驳回" }
    ]
  };
}

function normalizeState(loaded) {
  (loaded.applications || []).forEach(application => {
    application.testCaseCount ||= 24;
    application.failureEvidence ||= "已记录失败样本、触发条件和人工复核结果。";
    application.knowledgeSource ||= application.type === "Agent" ? "脱敏业务文档与已确认FAQ" : "结构化输入与规则说明";
    application.fallbackPlan ||= "工具失败或结果不确定时停止自动执行，提示用户转人工处理。";
    application.privacyNotes ||= "仅使用脱敏测试数据，按最小权限访问必要资源。";
    application.guideStatus ||= ["已上架", "已通过"].includes(application.status) ? "已完成使用指引" : "已提交初稿，待审核";
  });
  (loaded.tickets || []).forEach(ticket => {
    const collaboration = getCollaborationDefaults(ticket);
    if (!ticket.collaborator || ticket.collaborator === ticket.owner || ticket.collaborator === "运营-小林") {
      ticket.collaborator = collaboration.collaborator;
      ticket.collaborationDepartment = collaboration.department;
    }
    ticket.responseChannel ||= ticket.firstResponseAt ? "内部咨询" : "";
    ticket.responseContent ||= ticket.firstResponseAt ? `已收到“${ticket.title}”，正在核对影响范围，将按约定时间同步下一次进展。` : "";
    ticket.initialAssessment ||= ticket.firstResponseAt ? ticket.initialCause || "已完成基础排查。" : "";
    ticket.escalatedTo ||= ticket.firstResponseAt ? ticket.collaborator : "";
    ticket.followUps ||= [];
    ticket.followUps.forEach(record => {
      if (record.from === "运营-小林" && record.to === "运营-小林") record.to = ticket.collaborator;
    });
    if (ticket.status === "已关闭") {
      let closingRecord = ticket.followUps.find(record => record.action === "完成回归验证并同步用户");
      const otherTimes = ticket.followUps.filter(record => record !== closingRecord).map(record => new Date(record.at).getTime()).filter(Number.isFinite);
      const latestOther = Math.max(new Date(ticket.createdAt).getTime(), ...otherTimes);
      const normalizedClosedAt = new Date(Math.max(new Date(ticket.closedAt || 0).getTime() || 0, latestOther + 3600000)).toISOString();
      ticket.closedAt = normalizedClosedAt;
      if (!closingRecord) {
        closingRecord = { id: crypto.randomUUID(), at: normalizedClosedAt, from: "运营-小林", to: ticket.collaborator, action: "完成回归验证并同步用户", result: ticket.userFeedback || "已完成验证并同步用户", nextStep: "评估是否沉淀FAQ并纳入周报", commitmentDate: "-" };
        ticket.followUps.push(closingRecord);
      } else {
        closingRecord.at = normalizedClosedAt;
        closingRecord.to = ticket.collaborator;
      }
    }
    ticket.followUps.sort((a, b) => new Date(a.at) - new Date(b.at));
    ticket.lastFollowUpAt = ticket.followUps.at(-1)?.at || ticket.createdAt;
  });
  (loaded.faqs || []).forEach(faq => {
    faq.answer = String(faq.answer || "").replace(/。{2,}/g, "。");
    if (faq.sourceIssue && faq.sourceIssue !== "-") {
      const sourceTicket = loaded.tickets?.find(ticket => ticket.id === faq.sourceIssue);
      if (!sourceTicket || sourceTicket.status !== "已关闭") faq.sourceIssue = "-";
    }
  });
  return loaded;
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || LEGACY_STORAGE_KEYS.map(key => localStorage.getItem(key)).find(Boolean);
    return normalizeState(saved ? JSON.parse(saved) : createSeedData());
  } catch {
    return createSeedData();
  }
}

let state = loadState();
let dialogType = null;
let dialogRecordId = null;
let dialogAction = null;
const tablePages = { accounts: 1, applications: 1, tickets: 1 };

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // file:// 等受限环境可能禁止本地存储，页面仍可在当前会话使用。
  }
}

function formatDateTime(value) {
  if (!value || value === "-") return "-";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function badge(status) {
  const green = ["已开通", "已通过", "已上架", "已关闭", "低"];
  const red = ["已驳回", "P0", "P1", "高"];
  const amber = ["待审核", "待整改", "处理中", "待验证", "中"];
  const blue = ["已复现", "已下架", "待确认", "P2", "P3"];
  let className = "";
  if (green.includes(status)) className = "green";
  if (red.includes(status)) className = "red";
  if (amber.includes(status)) className = "amber";
  if (blue.includes(status)) className = "blue";
  if (/^P[0-3]$/.test(status)) className = `priority-${status}`;
  return `<span class="badge ${className}">${escapeHtml(status)}</span>`;
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function addAudit(action, detail) {
  state.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), action, detail });
}

function getSummary() {
  const pendingAccounts = state.accounts.filter(item => item.status === "待审核").length;
  const pendingApps = state.applications.filter(item => ["待审核", "待整改"].includes(item.status)).length;
  const openTickets = state.tickets.filter(item => item.status !== "已关闭").length;
  const closedTickets = state.tickets.filter(item => item.status === "已关闭").length;
  const closeRate = state.tickets.length ? Math.round(closedTickets / state.tickets.length * 100) : 0;
  const totalCalls = state.metrics.reduce((sum, item) => sum + item.calls, 0);
  const activeUsers = state.metrics.at(-1)?.activeUsers || 0;
  return { pendingAccounts, pendingApps, openTickets, closedTickets, closeRate, totalCalls, activeUsers };
}

function renderMetricCards(target, cards) {
  document.querySelector(target).innerHTML = cards.map(card => `
    <article class="metric-card">
      <span class="metric-label">${escapeHtml(card.label)}</span>
      <strong class="metric-value">${escapeHtml(card.value)}</strong>
      <span class="metric-note ${card.tone || ""}">${escapeHtml(card.note)}</span>
    </article>
  `).join("");
}

function renderDashboard() {
  const summary = getSummary();
  renderMetricCards("#metric-grid", [
    { label: "待审核账号", value: summary.pendingAccounts, note: "需要核验申请用途与权限", tone: summary.pendingAccounts ? "alert" : "good" },
    { label: "待审核应用", value: summary.pendingApps, note: "Agent / Skill发布前检查", tone: summary.pendingApps ? "alert" : "good" },
    { label: "未闭环问题", value: summary.openTickets, note: `其中 P0/P1 共 ${state.tickets.filter(item => item.status !== "已关闭" && ["P0","P1"].includes(item.priority)).length} 项`, tone: "alert" },
    { label: "问题闭环率", value: `${summary.closeRate}%`, note: `${summary.closedTickets}/${state.tickets.length} 项已完成验证与反馈`, tone: "good" }
  ]);

  const chartMetrics = state.metrics.slice(-14);
  const maxCalls = Math.max(...chartMetrics.map(item => item.calls), 1);
  document.querySelector("#usage-chart").innerHTML = chartMetrics.map(item => `
    <div class="bar-column">
      <span class="bar-value">${item.calls}</span>
      <div class="bar" style="height:${Math.max(8, item.calls / maxCalls * 155)}px"></div>
      <span class="bar-label">${item.date.slice(5)}</span>
    </div>
  `).join("");

  const todo = [
    { title: "处理账号申请", desc: "核验用途、角色和资源范围", count: summary.pendingAccounts },
    { title: "完成应用审核", desc: "检查测试覆盖与风险兜底", count: summary.pendingApps },
    { title: "记录首次响应", desc: "优先处理临近或已超过SLA的问题", count: state.tickets.filter(item => !item.firstResponseAt).length },
    { title: "跟进跨部门承诺", desc: "检查已到期但尚未闭环的协作事项", count: state.tickets.filter(item => item.status !== "已关闭" && item.commitmentDate && item.commitmentDate !== "-" && item.commitmentDate < shortDate(0)).length },
    { title: "同步问题进展", desc: "优先反馈今日到期问题", count: state.tickets.filter(item => item.status !== "已关闭" && item.nextUpdate === shortDate(0)).length },
    { title: "更新FAQ", desc: "从已闭环问题沉淀知识", count: state.tickets.filter(item => item.status === "已关闭" && !state.faqs.some(faq => faq.sourceIssue === item.id)).length }
  ];
  document.querySelector("#todo-list").innerHTML = todo.map(item => `
    <div class="todo-item"><div><strong>${item.title}</strong><p>${item.desc}</p></div><span class="todo-count">${item.count}</span></div>
  `).join("");

  const risks = state.tickets.filter(item => item.status !== "已关闭").sort((a, b) => ["P0","P1","P2","P3"].indexOf(a.priority) - ["P0","P1","P2","P3"].indexOf(b.priority)).slice(0, 4);
  document.querySelector("#risk-list").innerHTML = risks.map(item => `
    <div class="risk-item"><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.id)} · ${escapeHtml(item.status)} · ${escapeHtml(item.collaborator || item.owner)} · ${escapeHtml(item.blocker || "待跟进")}</p></div>${badge(item.priority)}</div>
  `).join("");
}

function paginateItems(items, key) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  tablePages[key] = Math.min(Math.max(1, tablePages[key] || 1), totalPages);
  const start = (tablePages[key] - 1) * PAGE_SIZE;
  return { items: items.slice(start, start + PAGE_SIZE), totalPages, totalItems: items.length };
}

function renderPagination(key, totalPages, totalItems) {
  const container = document.querySelector(`#${key}-pagination`);
  if (!container) return;
  if (totalItems <= PAGE_SIZE) {
    container.innerHTML = totalItems ? `<span>共 ${totalItems} 条</span>` : "";
    return;
  }
  container.innerHTML = `<span>共 ${totalItems} 条 · 第 ${tablePages[key]}/${totalPages} 页</span><div class="pagination-buttons"><button class="button small ghost" data-page-key="${key}" data-page="${tablePages[key] - 1}" ${tablePages[key] === 1 ? "disabled" : ""}>上一页</button><button class="button small ghost" data-page-key="${key}" data-page="${tablePages[key] + 1}" ${tablePages[key] === totalPages ? "disabled" : ""}>下一页</button></div>`;
}

function renderAccounts() {
  const query = document.querySelector("#account-search").value.trim().toLowerCase();
  const status = document.querySelector("#account-status-filter").value;
  const filteredItems = state.accounts.filter(item => {
    const matchQuery = [item.name, item.department, item.purpose].join(" ").toLowerCase().includes(query);
    return matchQuery && (status === "all" || item.status === status);
  });
  const page = paginateItems(filteredItems, "accounts");
  const items = page.items;
  document.querySelector("#account-table").innerHTML = items.length ? items.map(item => `
    <tr>
      <td><span class="cell-title">${escapeHtml(item.name)}</span><span class="cell-sub">${item.id}</span></td>
      <td>${escapeHtml(item.department)}</td>
      <td><span class="cell-sub">${escapeHtml(item.purpose)}</span></td>
      <td><span class="cell-title">${escapeHtml(item.role)}</span><span class="cell-sub">${escapeHtml(item.resourceScope || "待审批核定")}${item.accessExpiry ? ` · 至${escapeHtml(item.accessExpiry)}` : ""}</span></td>
      <td>${formatDateTime(item.submittedAt)}</td>
      <td>${badge(item.status)}</td>
      <td><div class="action-group">
        <button class="button small ${item.status === "待审核" ? "primary" : "ghost"}" data-account-action="review" data-id="${item.id}">${item.status === "待审核" ? "审批核验" : "查看记录"}</button>
      </div></td>
    </tr>
  `).join("") : `<tr><td colspan="7" class="empty-state">没有符合条件的账号申请</td></tr>`;
  renderPagination("accounts", page.totalPages, page.totalItems);
}

function renderApplications() {
  const query = document.querySelector("#app-search").value.trim().toLowerCase();
  const status = document.querySelector("#app-status-filter").value;
  const filteredItems = state.applications.filter(item => {
    const matchQuery = [item.name, item.owner, item.scenario].join(" ").toLowerCase().includes(query);
    return matchQuery && (status === "all" || item.status === status);
  });
  const page = paginateItems(filteredItems, "applications");
  const items = page.items;
  document.querySelector("#application-table").innerHTML = items.length ? items.map(item => {
    const score = getReviewScore(item);
    let actions = `<button class="button small ghost" data-app-action="review" data-id="${item.id}">${item.status === "待审核" ? "开始审核" : "查看/复审"}</button>`;
    if (item.status === "已通过" || item.status === "已下架") actions += `<button class="button small primary" data-app-action="list" data-id="${item.id}">上架</button>`;
    if (item.status === "已上架") actions += `<button class="button small danger" data-app-action="unlist" data-id="${item.id}">下架</button>`;
    if (["已驳回", "待整改"].includes(item.status)) actions += `<button class="button small ghost" data-app-action="resubmit" data-id="${item.id}">重新提交</button>`;
    return `
      <tr>
        <td><span class="cell-title">${escapeHtml(item.name)}</span><span class="cell-sub">${item.id} · ${escapeHtml(item.version || "V1.0")}</span></td>
        <td>${badge(item.type)}</td>
        <td><span class="cell-title">${escapeHtml(item.owner)}</span><span class="cell-sub">提交 ${formatDateTime(item.submittedAt)}</span></td>
        <td><span class="cell-sub">${escapeHtml(item.scenario)}</span></td>
        <td>${item.passRate}%</td>
        <td>${score === null ? `<span class="subtle">未评分</span>` : `<span class="score-value">${score}</span><span class="cell-sub"> / 100</span>`}</td>
        <td>${badge(item.risk)}</td>
        <td>${badge(item.status)}</td>
        <td><div class="action-group">${actions}</div></td>
      </tr>`;
  }).join("") : `<tr><td colspan="9" class="empty-state">没有符合条件的应用</td></tr>`;
  renderPagination("applications", page.totalPages, page.totalItems);
}

function fillFilterOptions() {
  const categoryFilter = document.querySelector("#ticket-category-filter");
  const currentCategory = categoryFilter.value || "all";
  categoryFilter.innerHTML = `<option value="all">全部类型</option>${ticketCategories.map(item => `<option value="${item}">${item}</option>`).join("")}`;
  categoryFilter.value = currentCategory;
  const statusFilter = document.querySelector("#ticket-status-filter");
  const currentStatus = statusFilter.value || "all";
  statusFilter.innerHTML = `<option value="all">全部状态</option>${ticketStatuses.map(item => `<option value="${item}">${item}</option>`).join("")}`;
  statusFilter.value = currentStatus;
}

function renderTickets() {
  fillFilterOptions();
  const query = document.querySelector("#ticket-search").value.trim().toLowerCase();
  const category = document.querySelector("#ticket-category-filter").value;
  const priority = document.querySelector("#ticket-priority-filter").value;
  const status = document.querySelector("#ticket-status-filter").value;
  const filteredItems = state.tickets.filter(item => {
    const matchQuery = [item.id, item.user, item.title].join(" ").toLowerCase().includes(query);
    return matchQuery && (category === "all" || item.category === category) && (priority === "all" || item.priority === priority) && (status === "all" || item.status === status);
  });

  const page = paginateItems(filteredItems, "tickets");
  const items = page.items;
  document.querySelector("#ticket-table").innerHTML = items.length ? items.map(item => `
      <tr>
        <td><span class="cell-title">${item.id}</span><span class="cell-sub">${formatDateTime(item.createdAt)}</span></td>
        <td><span class="cell-title">${escapeHtml(item.title)}</span><span class="cell-sub">${escapeHtml(item.user)} · ${escapeHtml(item.description)}</span></td>
        <td>${item.status === "已关闭" ? badge(item.category) : `<select class="inline-select" data-ticket-field="category" data-id="${item.id}">${ticketCategories.map(value => `<option ${value === item.category ? "selected" : ""}>${value}</option>`).join("")}</select>`}</td>
        <td>${item.status === "已关闭" ? badge(item.priority) : `<select class="inline-select" data-ticket-field="priority" data-id="${item.id}">${["P0","P1","P2","P3"].map(value => `<option ${value === item.priority ? "selected" : ""}>${value}</option>`).join("")}</select>`}</td>
        <td><span class="cell-title">${escapeHtml(item.owner)}</span><span class="cell-sub">协作 ${escapeHtml(item.collaborator || "待确认")}</span></td>
        <td>${badge(item.status)}</td>
        <td><span class="${getSlaStatus(item).className}">${getSlaStatus(item).label}</span><span class="cell-sub">${item.firstResponseAt ? formatDateTime(item.firstResponseAt) : `截止 ${formatDateTime(item.slaDueAt)}`}</span></td>
        <td><span class="cell-title">${escapeHtml(item.nextUpdate)}</span><span class="cell-sub">承诺 ${escapeHtml(item.commitmentDate || "-")}</span></td>
        <td><div class="action-group">${item.firstResponseAt ? "" : `<button class="button small ghost" data-ticket-action="respond" data-id="${item.id}">记录响应</button>`}<button class="button small ${item.status === "已关闭" ? "ghost" : "primary"}" data-ticket-action="detail" data-id="${item.id}">${item.status === "已关闭" ? "查看记录" : "处理详情"}</button>${item.status === "已关闭" ? (state.faqs.some(faq => faq.sourceIssue === item.id) ? `<span class="action-complete">已沉淀FAQ</span>` : `<button class="button small ghost" data-ticket-action="faq" data-id="${item.id}">沉淀FAQ</button>`) : ""}</div></td>
      </tr>`).join("") : `<tr><td colspan="9" class="empty-state">没有符合条件的问题</td></tr>`;
  renderPagination("tickets", page.totalPages, page.totalItems);
}

function getRangeData(days) {
  const metrics = state.metrics.slice(-days);
  const startDate = metrics[0]?.date || shortDate(-(days - 1));
  const endDate = metrics.at(-1)?.date || shortDate(0);
  const tickets = state.tickets.filter(item => localDate(item.createdAt) >= startDate && localDate(item.createdAt) <= endDate);
  const cohortClosedTickets = tickets.filter(item => item.status === "已关闭");
  const closedInPeriod = state.tickets.filter(item => item.closedAt && localDate(item.closedAt) >= startDate && localDate(item.closedAt) <= endDate);
  const slaCandidates = tickets.filter(item => getSlaStatus(item).eligible);
  const slaMet = slaCandidates.filter(item => getSlaStatus(item).label === "达标").length;
  const pendingResponses = tickets.filter(item => getSlaStatus(item).label === "待响应").length;
  const overdueResponses = tickets.filter(item => ["超时", "已超时"].includes(getSlaStatus(item).label)).length;
  const averageResolutionHours = closedInPeriod.length
    ? Math.round(closedInPeriod.reduce((sum, item) => sum + Math.max(0, (new Date(item.closedAt) - new Date(item.createdAt)) / 3600000), 0) / closedInPeriod.length * 10) / 10
    : 0;
  return {
    metrics,
    tickets,
    cohortClosedTickets,
    closedInPeriod,
    currentBacklog: state.tickets.filter(item => item.status !== "已关闭").length,
    calls: metrics.reduce((sum, item) => sum + item.calls, 0),
    averageUsers: metrics.length ? Math.round(metrics.reduce((sum, item) => sum + item.activeUsers, 0) / metrics.length) : 0,
    cohortCloseRate: tickets.length ? Math.round(cohortClosedTickets.length / tickets.length * 100) : 0,
    slaRate: slaCandidates.length ? Math.round(slaMet / slaCandidates.length * 100) : 100,
    pendingResponses,
    overdueResponses,
    averageResolutionHours
  };
}

function buildReport(days = 60) {
  refreshApplicationMetrics(state.applications, state.metrics);
  const summary = getSummary();
  const range = getRangeData(days);
  const highPriority = state.tickets.filter(item => item.status !== "已关闭" && ["P0", "P1"].includes(item.priority));
  const categoryCounts = Object.fromEntries(ticketCategories.map(category => [category, range.tickets.filter(item => item.category === category).length]));
  const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0] || ["暂无", 0];
  const applicationRisks = state.applications.map(item => ({ item, health: getApplicationHealth(item) })).filter(record => ["risk", "warning", "pending"].includes(record.health.tone));
  return `# 智能体平台运营${days}日简报（模拟）

> 数据说明：本报告基于演示环境中的虚构数据自动生成，不代表真实企业运营情况。

## 一、核心摘要

- 近${days}日累计调用 ${range.calls} 次，日均活跃用户 ${range.averageUsers} 人。
- 当前待审核账号 ${summary.pendingAccounts} 个，待审核应用 ${summary.pendingApps} 个。
- 统计期内新增问题 ${range.tickets.length} 项，期间完成关闭 ${range.closedInPeriod.length} 项，当前遗留未闭环 ${range.currentBacklog} 项。
- 本期新增问题中已有 ${range.cohortClosedTickets.length} 项关闭，新增问题最终闭环率为 ${range.cohortCloseRate}%。
- 首次响应 SLA 达标率 ${range.slaRate}%，待响应 ${range.pendingResponses} 项，超时 ${range.overdueResponses} 项；期间关闭问题平均处理时长 ${range.averageResolutionHours} 小时。
- 未闭环的 P0/P1 问题 ${highPriority.length} 项，需要优先同步处理进展。

## 二、重点问题

${highPriority.length ? highPriority.map(item => `- ${item.id}｜${item.priority}｜${item.title}｜当前状态：${item.status}｜下一步：${item.resolution}`).join("\n") : "- 当前无未闭环的 P0/P1 问题。"}

## 三、问题分布

- 数量最多的问题类型：${topCategory[0]}（${topCategory[1]}项）。
${Object.entries(categoryCounts).map(([category, count]) => `- ${category}：${count}项`).join("\n")}

## 四、应用运营健康度

${applicationRisks.length ? applicationRisks.map(record => `- ${record.item.id}｜${record.item.name}｜${record.health.label}｜${record.health.action}`).join("\n") : "- 当前没有需要立即推进的应用健康度风险。"}

## 五、下一阶段运营动作

- 继续核验待审核账号的申请用途和权限范围。
- 对待审核应用执行发布前检查，重点关注高风险场景和异常兜底。
- 优先推进 P0/P1 问题，完成复现、定位、验证与用户反馈。
- 从已闭环问题中筛选高频内容，持续更新 FAQ 和用户指南。

## 六、数据核验

- 调用量取自项目内模拟指标表。
- “期间关闭”按关闭时间统计；“新增问题最终闭环率”按本期新增问题的当前最终状态统计。
- 首次响应SLA仅统计已经响应或已经超过响应时限的问题，仍在时限内的待响应问题不计入分母。
- 问题数量、状态和优先级取自问题台账。
- AI生成摘要仅作为初稿，发布前应与原始记录逐项核对。
`;
}

function buildPlatformGuide() {
  return `# AgentOps Desk｜平台使用说明

> 页面中的用户、应用和运营数据均为虚构内容，仅用于功能演示，不代表真实企业运营情况。

## 这个项目解决什么问题

平台覆盖五类运营流程：账号与权限审批、Agent/Skill发布审核、用户问题闭环、FAQ沉淀、数据统计与周报核验。

## 核心术语

- Agent：能够理解目标、调用知识或工具并完成多步骤任务的智能体。
- Skill：边界更明确、可复用的单项能力。
- 知识库：为AI提供可检索资料的内容集合，运营需要关注来源、版本和命中情况。
- 意图识别：判断用户真正想完成的任务，以便选择正确流程。
- SLA：团队承诺的服务时限。本项目指首次响应时限，不等于解决时限。
- 问题闭环：从反馈、分类、响应、定位、处理、验证、用户确认到知识沉淀的完整过程。

## 优先级与首次响应SLA

- P0：15分钟，核心服务不可用或存在重大安全风险。
- P1：2小时，多名用户或关键流程受到明显影响。
- P2：24小时，局部问题，有替代方案。
- P3：48小时，一般咨询或优化建议。

## 建议操作顺序

1. 打开“使用指南”，了解术语、SLA和数据边界。
2. 进入“账号开通”，核验用途、最小权限范围和到期日。
3. 进入“应用审核”，展示测试证据、评分标准、一票否决和上架流程。
4. 进入“问题闭环”，为待响应问题记录渠道、回复内容、初判、协作人与下次反馈时间，再按规则推进状态。
5. 关闭问题后沉淀FAQ；进入“数据周报”，完成人工核验清单后下载简报。

## 平台能力与运营职责

- 账号开通与权限审批：对应平台日常运营和账号管理。
- 应用证据、审核评分、上架下架：对应Agent/Skill/场景化AI应用的审核与治理。
- 首次响应、SLA、问题状态机和协作时间线：对应微信群支持、问题分类、优先级判断、进度跟踪和结果反馈。
- FAQ沉淀和新手指南：对应常见问题整理、使用指引和体验优化。
- 指标统计、人工核验和Markdown简报：对应AI辅助数据整理、结论核验和定期周报。
- 本文档与项目说明：对应平台推广及介绍材料编制。

## 数据与使用边界

- 本站是运营流程演示，不接入真实公司系统或客户数据。
- 数据由本地脚本生成，AI结论必须人工核验。
- 浏览器本地数据不会自动同步到其他电脑，清理浏览器数据后会恢复默认内容。
`;
}

function syncReportVerification() {
  const checks = [...document.querySelectorAll("[data-report-check]")];
  const reviewer = document.querySelector("#report-reviewer");
  const status = document.querySelector("#verification-status");
  const hint = document.querySelector("#verification-hint");
  const download = document.querySelector("#download-report");
  if (!reviewer || !status || !hint || !download) return;
  const remaining = checks.filter(check => !check.checked).length;
  const hasReviewer = Boolean(reviewer.value.trim());
  const ready = remaining === 0 && hasReviewer;
  download.disabled = !ready;
  status.textContent = ready ? "已核验" : "待核验";
  status.className = `badge ${ready ? "green" : "amber"}`;
  hint.textContent = ready
    ? `核验完成，可由${reviewer.value.trim()}下载简报。`
    : `还需完成${remaining}项核验${hasReviewer ? "" : "并填写核验人"}。`;
}

function resetReportVerification() {
  document.querySelectorAll("[data-report-check]").forEach(check => { check.checked = false; });
  const reviewer = document.querySelector("#report-reviewer");
  if (reviewer) reviewer.value = "";
  syncReportVerification();
}

function renderAnalytics() {
  const days = Number(document.querySelector("#analytics-range")?.value || 60);
  refreshApplicationMetrics(state.applications, state.metrics);
  const range = getRangeData(days);
  document.querySelector("#download-report").textContent = `下载${days}日简报.md`;
  renderMetricCards("#analytics-metrics", [
    { label: `近${days}日调用`, value: range.calls, note: "来自模拟平台指标，发布前需核验", tone: "good" },
    { label: "日均活跃用户", value: range.averageUsers, note: `${range.metrics[0]?.date || "-"} 至 ${range.metrics.at(-1)?.date || "-"}` },
    { label: "本期新增 / 关闭", value: `${range.tickets.length} / ${range.closedInPeriod.length}`, note: `当前遗留未闭环 ${range.currentBacklog} 项`, tone: "good" },
    { label: "首次响应SLA", value: `${range.slaRate}%`, note: `待响应${range.pendingResponses}项 · 超时${range.overdueResponses}项`, tone: range.slaRate >= 90 ? "good" : "alert" }
  ]);

  const counts = ticketCategories.map(category => ({ category, count: range.tickets.filter(item => item.category === category).length }));
  const max = Math.max(...counts.map(item => item.count), 1);
  document.querySelector("#category-distribution").innerHTML = counts.map(item => `
    <div class="distribution-row"><span>${item.category}</span><div class="progress-track"><div class="progress-fill" style="width:${item.count / max * 100}%"></div></div><strong>${item.count}</strong></div>
  `).join("");

  const activeApplications = state.applications.filter(item => !["已驳回", "已下架"].includes(item.status));
  const weightedCalls = activeApplications.reduce((sum, item) => sum + Math.round(item.callVolume * days / 60), 0);
  const weightedSuccess = activeApplications.reduce((sum, item) => sum + item.successRate * Math.max(item.callVolume, 1), 0) / Math.max(activeApplications.reduce((sum, item) => sum + Math.max(item.callVolume, 1), 0), 1);
  const weightedNegative = activeApplications.reduce((sum, item) => sum + item.negativeRate * Math.max(item.callVolume, 1), 0) / Math.max(activeApplications.reduce((sum, item) => sum + Math.max(item.callVolume, 1), 0), 1);
  const applicationsWithHealth = state.applications.map(item => ({ ...item, periodCalls: Math.round(item.callVolume * days / 60), periodManualInterventions: Math.round(item.manualInterventions * days / 60), health: getApplicationHealth(item) }));
  const priority = { risk: 0, warning: 1, pending: 2, healthy: 3, muted: 4 };
  applicationsWithHealth.sort((a, b) => priority[a.health.tone] - priority[b.health.tone] || b.periodCalls - a.periodCalls);
  document.querySelector("#application-health-range").textContent = `近${days}日模拟数据`;
  renderMetricCards("#application-health-metrics", [
    { label: `近${days}日应用调用`, value: weightedCalls, note: "按60日应用数据折算", tone: "good" },
    { label: "加权成功率", value: `${(weightedSuccess * 100).toFixed(1)}%`, note: "按各应用调用量加权", tone: weightedSuccess >= 0.95 ? "good" : "alert" },
    { label: "加权负反馈率", value: `${(weightedNegative * 100).toFixed(1)}%`, note: "需结合失败样本人工核验", tone: weightedNegative <= 0.02 ? "good" : "alert" },
    { label: "需推进应用", value: applicationsWithHealth.filter(item => ["risk", "warning", "pending"].includes(item.health.tone)).length, note: "整改、审核或知识库优化", tone: "alert" }
  ]);
  document.querySelector("#application-health-table").innerHTML = applicationsWithHealth.map(item => `
    <tr>
      <td><span class="cell-title">${escapeHtml(item.name)}</span><span class="cell-sub">${escapeHtml(item.id)} · ${escapeHtml(item.type)} · ${escapeHtml(item.version)}</span></td>
      <td>${badge(item.status)}</td>
      <td>${item.periodCalls}</td>
      <td>${(item.successRate * 100).toFixed(1)}%</td>
      <td>${(item.negativeRate * 100).toFixed(1)}%</td>
      <td>${item.kbMissRate === null ? "不适用" : `${(item.kbMissRate * 100).toFixed(1)}%`}</td>
      <td>${item.periodManualInterventions}</td>
      <td><span class="health-status ${item.health.tone}">${escapeHtml(item.health.label)}</span><span class="cell-sub">${escapeHtml(item.health.action)}</span></td>
    </tr>`).join("");
  document.querySelector("#report-preview").value = buildReport(days);
}

function renderFaq() {
  document.querySelector("#faq-grid").innerHTML = state.faqs.map(item => `
    <article class="faq-card">
      ${badge(item.category)}
      <h3>${escapeHtml(item.question)}</h3>
      <p>${escapeHtml(item.answer)}</p>
      <div class="faq-meta"><span>更新 ${escapeHtml(item.updatedAt)}</span><span>来源 ${escapeHtml(item.sourceIssue === "-" ? "人工整理" : item.sourceIssue)}</span></div>
    </article>
  `).join("");
}

function renderAudit() {
  document.querySelector("#audit-timeline").innerHTML = state.audit.length ? state.audit.map(item => `
    <div class="timeline-item">
      <time class="timeline-time">${formatDateTime(item.at)}</time>
      <span class="timeline-dot"></span>
      <div class="timeline-content"><strong>${escapeHtml(item.action)}</strong><p>${escapeHtml(item.detail)}</p></div>
    </div>
  `).join("") : `<p class="empty-state">暂无操作记录</p>`;
}

function renderAll() {
  renderDashboard();
  renderAccounts();
  renderApplications();
  renderTickets();
  renderAnalytics();
  renderFaq();
  renderAudit();
  syncReportVerification();
  saveState();
}

function setView(view) {
  document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === view));
  document.querySelectorAll(".view").forEach(item => item.classList.toggle("active", item.id === `${view}-view`));
  document.querySelector("#page-title").textContent = pageTitles[view];
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function handleAccountAction(event) {
  const button = event.target.closest("[data-account-action]");
  if (!button) return;
  const item = state.accounts.find(account => account.id === button.dataset.id);
  if (!item) return;
  if (button.dataset.accountAction === "review") openDialog("accountReview", item.id);
}

function handleApplicationAction(event) {
  const button = event.target.closest("[data-app-action]");
  if (!button) return;
  const item = state.applications.find(application => application.id === button.dataset.id);
  if (!item) return;
  if (button.dataset.appAction === "review") {
    openDialog("appReview", item.id);
    return;
  }
  if (["resubmit", "list", "unlist"].includes(button.dataset.appAction)) openDialog("appLifecycle", item.id, button.dataset.appAction);
}

function handleTicketClick(event) {
  const button = event.target.closest("[data-ticket-action]");
  if (!button) return;
  const item = state.tickets.find(ticket => ticket.id === button.dataset.id);
  if (!item) return;
  if (button.dataset.ticketAction === "respond") {
    openDialog("ticketResponse", item.id);
    return;
  }
  if (button.dataset.ticketAction === "detail") openDialog("ticketDetail", item.id);
  if (button.dataset.ticketAction === "faq") openDialog("faq", item.id);
}

function handleTicketChange(event) {
  const select = event.target.closest("[data-ticket-field]");
  if (!select) return;
  const item = state.tickets.find(ticket => ticket.id === select.dataset.id);
  if (!item) return;
  if (item.status === "已关闭") {
    renderTickets();
    showToast("已关闭问题为只读记录，不能直接改分类或优先级");
    return;
  }
  const field = select.dataset.ticketField;
  const previous = item[field];
  item[field] = select.value;
  if (field === "priority") {
    item.slaDueAt = addHours(item.createdAt, slaHoursByPriority[item.priority]);
    item.slaBreached = item.firstResponseAt ? new Date(item.firstResponseAt) > new Date(item.slaDueAt) : null;
  }
  addAudit("问题信息更新", `${item.id} ${field}：${previous} → ${select.value}`);
  renderAll();
  showToast(`${item.id} 已更新`);
}

function fieldMarkup(label, name, type = "text", options = [], full = false, required = true) {
  let control = `<input id="field-${name}" name="${name}" type="${type}" ${required ? "required" : ""} />`;
  if (type === "textarea") control = `<textarea id="field-${name}" name="${name}" ${required ? "required" : ""}></textarea>`;
  if (type === "select") control = `<select id="field-${name}" name="${name}" ${required ? "required" : ""}>${options.map(option => `<option value="${option}">${option}</option>`).join("")}</select>`;
  return `<div class="field ${full ? "full" : ""}"><label for="field-${name}">${label}</label>${control}</div>`;
}

function sentenceFragment(value) {
  return String(value || "").trim().replace(/[。；;，,\s]+$/g, "");
}

function getAccountScopeSuggestion(role) {
  if (role === "应用管理员") return "指定工作空间及应用管理";
  if (role === "开发者") return "开发调试环境与应用日志";
  return "指定应用使用权限";
}

function getAccountCommentSuggestion(decision) {
  return decision === "驳回"
    ? "申请用途或权限范围不够明确，需要补充后重新申请。"
    : "申请用途明确，按最小权限原则开通指定范围。";
}

function clearDialogError() {
  const error = document.querySelector("#dialog-error");
  error.hidden = true;
  error.textContent = "";
  document.querySelectorAll("#dynamic-form [aria-invalid='true']").forEach(field => field.removeAttribute("aria-invalid"));
}

function showDialogError(message, fieldId = "") {
  const error = document.querySelector("#dialog-error");
  error.textContent = message;
  error.hidden = false;
  if (fieldId) {
    const field = document.querySelector(fieldId);
    field?.setAttribute("aria-invalid", "true");
    field?.focus();
  }
  showToast(message);
}

function syncAccountReviewFields() {
  const decision = document.querySelector("#field-decision");
  const expiry = document.querySelector("#field-accessExpiry");
  const comment = document.querySelector("#field-approvalComment");
  const guide = document.querySelector("#account-decision-guide");
  const submit = document.querySelector("#dialog-submit");
  if (!decision || !expiry || !comment || !guide) return;
  const isOpening = decision.value === "开通";
  expiry.disabled = !isOpening;
  expiry.required = isOpening;
  expiry.closest(".field")?.classList.toggle("is-disabled", !isOpening);
  if (isOpening && !expiry.value) expiry.value = shortDate(90);
  if (comment.dataset.autoSuggested === "true") {
    comment.value = getAccountCommentSuggestion(decision.value);
  }
  guide.textContent = isOpening
    ? "同意后账号将变为“已开通”。请确认核定角色、最小权限范围和到期日。"
    : "驳回后账号将变为“已驳回”，权限到期日无需填写；请保留清晰的补充要求。";
  submit.textContent = isOpening ? "确认开通" : "确认驳回";
}

function openDialog(type, recordId = null, action = null) {
  dialogType = type;
  dialogRecordId = recordId;
  dialogAction = action;
  const title = document.querySelector("#dialog-title");
  const kicker = document.querySelector("#dialog-kicker");
  const fields = document.querySelector("#dialog-fields");
  const submit = document.querySelector("#dialog-submit");
  const cancelButton = document.querySelector(".dialog-actions [data-dialog-close]");
  clearDialogError();
  submit.hidden = false;
  submit.textContent = "保存";
  cancelButton.textContent = "取消";
  if (type === "account") {
    kicker.textContent = "ACCOUNT REQUEST";
    title.textContent = "新增账号申请";
    fields.innerHTML = fieldMarkup("申请人", "name") + fieldMarkup("部门", "department") + fieldMarkup("申请角色", "role", "select", ["普通用户", "开发者", "应用管理员"]) + fieldMarkup("申请用途", "purpose", "textarea", [], true);
  }
  if (type === "accountReview") {
    const item = state.accounts.find(account => account.id === recordId);
    if (!item) return;
    const isReadOnly = item.status !== "待审核";
    kicker.textContent = isReadOnly ? "ACCESS RECORD" : "ACCESS REVIEW";
    title.textContent = `${item.id} ${isReadOnly ? "账号审批记录" : "账号审批核验"}`;
    const defaultDecision = item.status === "已驳回" ? "驳回" : "开通";
    const hasPendingScope = !item.resourceScope || /^待审批/.test(item.resourceScope.trim());
    const hasPendingComment = !item.approvalComment || /^待核验/.test(item.approvalComment.trim());
    const scopeValue = hasPendingScope ? getAccountScopeSuggestion(item.role) : item.resourceScope;
    const commentValue = hasPendingComment ? getAccountCommentSuggestion(defaultDecision) : item.approvalComment;
    const decisions = ["开通", "驳回"].map(value => `<option value="${value}" ${(value === "开通" && item.status === "已开通") || (value === "驳回" && item.status === "已驳回") ? "selected" : ""}>${value}</option>`).join("");
    fields.innerHTML = `
      <div class="dialog-summary full"><strong>${escapeHtml(item.name)} · ${escapeHtml(item.department)}</strong><p>申请角色：${escapeHtml(item.role)}｜申请用途：${escapeHtml(item.purpose)}</p></div>
      <div class="field"><label for="field-role">核定角色</label><select id="field-role" name="role" required>${["普通用户", "开发者", "应用管理员"].map(value => `<option value="${value}" ${value === item.role ? "selected" : ""}>${value}</option>`).join("")}</select></div>
      <div class="field"><label for="field-accessExpiry">权限到期日（开通时必填）</label><input id="field-accessExpiry" name="accessExpiry" type="date" min="${shortDate(0)}" value="${escapeHtml(item.accessExpiry || shortDate(90))}" /></div>
      <div class="field full"><label for="field-resourceScope">资源与权限范围</label><textarea id="field-resourceScope" name="resourceScope" required data-auto-suggested="${hasPendingScope}">${escapeHtml(scopeValue)}</textarea><p class="field-help">已按角色给出最小权限建议，可根据真实申请范围修改。</p></div>
      <div class="field"><label for="field-decision">审批结论</label><select id="field-decision" name="decision" required>${decisions}</select></div>
      <div class="decision-guide" id="account-decision-guide"></div>
      <div class="field full"><label for="field-approvalComment">审批意见 / 驳回原因</label><textarea id="field-approvalComment" name="approvalComment" required data-auto-suggested="${hasPendingComment}">${escapeHtml(commentValue)}</textarea><p class="field-help">${isReadOnly ? `处理时间：${formatDateTime(item.processedAt)}。已完成记录保持只读。` : "系统给出可编辑的建议文本；保存后会进入审批记录。"}</p></div>`;
    if (isReadOnly) {
      fields.querySelectorAll("input, select, textarea").forEach(control => { control.disabled = true; });
      document.querySelector("#account-decision-guide").textContent = "此审批已经完成。为保证审计记录可信，页面不允许再次修改；如需调整应提交新的账号申请。";
      submit.hidden = true;
      cancelButton.textContent = "关闭";
    } else {
    const roleField = document.querySelector("#field-role");
    const scopeField = document.querySelector("#field-resourceScope");
    const commentField = document.querySelector("#field-approvalComment");
    roleField.addEventListener("change", () => {
      if (scopeField.dataset.autoSuggested === "true") scopeField.value = getAccountScopeSuggestion(roleField.value);
    });
    scopeField.addEventListener("input", () => { scopeField.dataset.autoSuggested = "false"; });
    commentField.addEventListener("input", () => { commentField.dataset.autoSuggested = "false"; });
    document.querySelector("#field-decision").addEventListener("change", syncAccountReviewFields);
    syncAccountReviewFields();
    }
  }
  if (type === "application") {
    kicker.textContent = "APPLICATION SUBMISSION";
    title.textContent = "提交Agent / Skill";
    fields.innerHTML = fieldMarkup("应用名称", "name") + fieldMarkup("类型", "type", "select", ["Agent", "Skill"]) + fieldMarkup("提交人", "owner") + fieldMarkup("测试通过率（0-100）", "passRate", "number") + fieldMarkup("风险等级", "risk", "select", ["低", "中", "高"]) + fieldMarkup("测试用例数", "testCaseCount", "number") + fieldMarkup("应用场景与边界", "scenario", "textarea", [], true) + fieldMarkup("知识或数据来源", "knowledgeSource", "textarea", [], true) + fieldMarkup("失败样本与人工复核证据", "failureEvidence", "textarea", [], true) + fieldMarkup("异常兜底与转人工方案", "fallbackPlan", "textarea", [], true) + fieldMarkup("隐私与权限说明", "privacyNotes", "textarea", [], true) + fieldMarkup("使用指引准备情况", "guideStatus", "select", ["已完成使用指引", "已提交初稿，待审核", "尚未准备"], true);
    document.querySelector("#field-passRate").min = "0";
    document.querySelector("#field-passRate").max = "100";
    document.querySelector("#field-testCaseCount").min = "1";
  }
  if (type === "ticket") {
    kicker.textContent = "NEW ISSUE";
    title.textContent = "登记用户问题";
    fields.innerHTML = fieldMarkup("匿名用户编号", "user") + fieldMarkup("问题类型", "category", "select", ticketCategories) + fieldMarkup("优先级", "priority", "select", ["P0", "P1", "P2", "P3"]) + fieldMarkup("负责人", "owner", "select", ["运营-小林", "产品-周宁", "技术-陈工"]) + fieldMarkup("下次反馈日期", "nextUpdate", "date") + fieldMarkup("问题标题", "title", "text", [], true) + fieldMarkup("问题描述与复现信息", "description", "textarea", [], true);
    document.querySelector("#field-nextUpdate").value = shortDate(1);
  }
  if (type === "ticketResponse") {
    const item = state.tickets.find(ticket => ticket.id === recordId);
    if (!item) return;
    kicker.textContent = "FIRST RESPONSE RECORD";
    title.textContent = `${item.id} 记录首次响应`;
    submit.textContent = "保存首次响应";
    fields.innerHTML = `
      <div class="dialog-summary full"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.priority)}｜创建 ${formatDateTime(item.createdAt)}｜SLA截止 ${formatDateTime(item.slaDueAt)}</p></div>
      <div class="decision-guide full">首次响应不是“已经解决”。它要证明你及时确认了问题、给出初步判断、找到协作人，并明确下一次反馈时间。</div>
      <div class="field"><label for="field-responseChannel">响应渠道</label><select id="field-responseChannel" name="responseChannel" required>${responseChannels.map(channel => `<option value="${escapeHtml(channel)}">${escapeHtml(channel)}</option>`).join("")}</select></div>
      <div class="field"><label for="field-escalatedTo">升级 / 协作人</label><input id="field-escalatedTo" name="escalatedTo" value="${escapeHtml(item.collaborator || "")}" required /></div>
      <div class="field full"><label for="field-responseContent">给用户的首次回复</label><textarea id="field-responseContent" name="responseContent" required>已收到“${escapeHtml(item.title)}”，我们正在核对影响范围并协调${escapeHtml(item.collaborationDepartment || "相关团队")}定位，预计${escapeHtml(item.nextUpdate || shortDate(1))}前同步下一次进展。</textarea></div>
      <div class="field full"><label for="field-initialAssessment">初步判断</label><textarea id="field-initialAssessment" name="initialAssessment" required>${escapeHtml(item.initialCause || "已完成基础排查，仍需结合日志、配置或用户信息进一步确认。")}</textarea></div>
      <div class="field"><label for="field-nextUpdate">下次反馈日期</label><input id="field-nextUpdate" name="nextUpdate" type="date" min="${shortDate(0)}" value="${escapeHtml(item.nextUpdate === "-" ? shortDate(1) : item.nextUpdate || shortDate(1))}" required /></div>`;
  }
  if (type === "faq") {
    const sourceTicket = state.tickets.find(ticket => ticket.id === recordId);
    kicker.textContent = sourceTicket ? "KNOWLEDGE HANDOFF" : "NEW FAQ";
    title.textContent = sourceTicket ? `从${sourceTicket.id}沉淀FAQ` : "新增FAQ";
    submit.textContent = sourceTicket ? "保存并完成沉淀" : "保存";
    const categories = [...ticketCategories, "问题反馈"].map(option => `<option value="${option}" ${option === sourceTicket?.category ? "selected" : ""}>${option}</option>`).join("");
    fields.innerHTML = `${sourceTicket ? `<div class="dialog-summary full"><strong>${escapeHtml(sourceTicket.title)}</strong><p>处理结果：${escapeHtml(sourceTicket.resolution)}｜验证：${escapeHtml(sourceTicket.verification)}</p></div>` : ""}
      <div class="field"><label for="field-category">分类</label><select id="field-category" name="category" required>${categories}</select></div>
      <div class="field"><label for="field-sourceIssue">来源问题编号</label><input id="field-sourceIssue" name="sourceIssue" value="${escapeHtml(sourceTicket?.id || "")}" ${sourceTicket ? "readonly" : ""} /></div>
      <div class="field full"><label for="field-question">问题</label><textarea id="field-question" name="question" required>${escapeHtml(sourceTicket?.title || "")}</textarea></div>
      <div class="field full"><label for="field-answer">标准回答</label><textarea id="field-answer" name="answer" required>${escapeHtml(sourceTicket ? `处理方式：${sentenceFragment(sourceTicket.resolution)}。验证结果：${sentenceFragment(sourceTicket.verification)}。如仍未恢复，请提供匿名用户编号、应用版本和复现时间继续排查。` : "")}</textarea><p class="field-help">系统已生成初稿，保存前需要删除不适合公开的信息并人工核验。</p></div>`;
  }
  if (type === "appLifecycle") {
    const item = state.applications.find(application => application.id === recordId);
    if (!item) return;
    const config = {
      list: { kicker: "RELEASE CONFIRMATION", title: "确认应用上架", submit: "确认上架", label: "上架说明", placeholder: "例如：审核已通过，发布说明、用户指引和监控项均已核验。" },
      unlist: { kicker: "UNLIST CONFIRMATION", title: "确认应用下架", submit: "确认下架", label: "下架原因", placeholder: "例如：发现输出质量风险，先停止新用户访问并安排复盘。" },
      resubmit: { kicker: "RESUBMIT CONFIRMATION", title: "确认整改重提", submit: "确认重新提交", label: "整改说明", placeholder: "例如：已补充异常兜底和回归测试，提交新版本复审。" }
    }[action];
    if (!config) return;
    kicker.textContent = config.kicker;
    title.textContent = config.title;
    submit.textContent = config.submit;
    fields.innerHTML = `
      <div class="dialog-summary full"><strong>${escapeHtml(item.name)} · ${escapeHtml(item.version || "V1.0")}</strong><p>当前状态：${escapeHtml(item.status)}｜审核得分：${getReviewScore(item) ?? "未评分"}｜风险：${escapeHtml(item.risk)}</p></div>
      <div class="decision-guide full">状态变更会写入操作日志。请填写能让下一位运营人员理解原因和后续动作的说明。</div>
      <div class="field full"><label for="field-lifecycleReason">${config.label}</label><textarea id="field-lifecycleReason" name="lifecycleReason" placeholder="${config.placeholder}" required></textarea></div>`;
  }
  if (type === "appReview") {
    const item = state.applications.find(application => application.id === recordId);
    if (!item) return;
    kicker.textContent = "REVIEW SCORECARD";
    title.textContent = `${item.id} 应用审核评分`;
    submit.textContent = "保存审核结论";
    const scoreFields = reviewDimensions.map(dimension => `
      <div class="field">
        <label for="field-score-${dimension.key}">${dimension.label}（满分${dimension.max}）</label>
        <input id="field-score-${dimension.key}" name="score_${dimension.key}" type="number" min="0" max="${dimension.max}" value="${item.reviewScores ? Number(item.reviewScores[dimension.key] || 0) : ""}" required />
        <p class="rubric-card">${escapeHtml(dimension.rubric)}</p>
      </div>`).join("");
    const vetoFields = vetoOptions.map(option => `
      <label class="checkbox-item"><input type="checkbox" name="veto" value="${escapeHtml(option)}" ${(item.vetoes || []).includes(option) ? "checked" : ""} />${escapeHtml(option)}</label>`).join("");
    const historyMarkup = (item.reviewHistory || []).length ? `
      <div class="field full"><label>历史审核记录</label><div class="review-history">${item.reviewHistory.slice().reverse().map(record => `<div><strong>${escapeHtml(record.version)} · ${record.score}分 · ${escapeHtml(record.result)}</strong><span>${formatDateTime(record.reviewedAt)}｜${escapeHtml(record.comment)}</span></div>`).join("")}</div></div>` : "";
    fields.innerHTML = `
      <div class="dialog-summary full"><strong>${escapeHtml(item.name)} · ${escapeHtml(item.version || "V1.0")}</strong><p>${escapeHtml(item.type)}｜测试通过率 ${item.passRate}%｜风险 ${escapeHtml(item.risk)}｜${escapeHtml(item.scenario)}</p></div>
      <div class="evidence-grid full">
        <div><span>测试证据</span><strong>${escapeHtml(item.testCaseCount)}条用例</strong><p>${escapeHtml(item.failureEvidence)}</p></div>
        <div><span>知识 / 数据来源</span><strong>${escapeHtml(item.knowledgeSource)}</strong><p>${escapeHtml(item.privacyNotes)}</p></div>
        <div><span>异常兜底</span><strong>${escapeHtml(item.guideStatus)}</strong><p>${escapeHtml(item.fallbackPlan)}</p></div>
      </div>
      ${scoreFields}
      <div class="field full"><label>一票否决项</label><div class="checkbox-grid">${vetoFields}</div><p class="field-help">命中任意一项时，无论总分多少都不能通过。</p></div>
      <div class="field full"><label for="field-reviewComment">审核意见</label><textarea id="field-reviewComment" name="reviewComment" required>${escapeHtml(item.reviewScores ? item.reviewComment || "" : "")}</textarea></div>
      ${historyMarkup}`;
  }
  if (type === "ticketDetail") {
    const item = state.tickets.find(ticket => ticket.id === recordId);
    if (!item) return;
    kicker.textContent = "ISSUE CLOSURE RECORD";
    const isReadOnly = item.status === "已关闭";
    title.textContent = `${item.id} ${isReadOnly ? "问题闭环记录" : "问题处理详情"}`;
    submit.textContent = "保存闭环记录";
    const optionMarkup = (options, selected) => options.map(option => `<option value="${escapeHtml(option)}" ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>`).join("");
    const slaStatus = getSlaStatus(item);
    const followUpMarkup = (item.followUps || []).slice().reverse().map(record => `
      <div class="followup-item">
        <div class="followup-dot"></div>
        <div><strong>${escapeHtml(record.action)}</strong><span>${formatDateTime(record.at)}｜${escapeHtml(record.from)} → ${escapeHtml(record.to)}</span><p>${escapeHtml(record.result)}</p><small>下一步：${escapeHtml(record.nextStep || "待确认")}｜承诺：${escapeHtml(record.commitmentDate || "-")}</small></div>
      </div>`).join("") || `<p class="empty-state">暂无协作跟进记录</p>`;
    fields.innerHTML = `
      <div class="dialog-summary full"><strong>${escapeHtml(item.title)}</strong><p>创建 ${formatDateTime(item.createdAt)}｜首次响应 ${formatDateTime(item.firstResponseAt)}｜SLA截止 ${formatDateTime(item.slaDueAt)}｜<span class="${slaStatus.className}">${slaStatus.label}</span></p></div>
      ${item.firstResponseAt ? `<div class="response-evidence full">
        <div><span>响应渠道</span><strong>${escapeHtml(item.responseChannel || "未记录")}</strong></div>
        <div><span>升级协作人</span><strong>${escapeHtml(item.escalatedTo || item.collaborator || "未记录")}</strong></div>
        <div class="span-two"><span>首次回复</span><p>${escapeHtml(item.responseContent || "未记录回复内容")}</p></div>
        <div class="span-two"><span>初步判断</span><p>${escapeHtml(item.initialAssessment || item.initialCause || "未记录初步判断")}</p></div>
      </div>` : `<div class="decision-guide full">该问题尚未完成首次响应。请返回列表记录响应渠道、用户回复、初步判断、协作人和下次反馈时间。</div>`}
      <div class="collaboration-summary full">
        <div><span>协作部门</span><strong>${escapeHtml(item.collaborationDepartment || "待确认")}</strong></div>
        <div><span>协作人</span><strong>${escapeHtml(item.collaborator || "待确认")}</strong></div>
        <div><span>承诺时间</span><strong>${escapeHtml(item.commitmentDate || "-")}</strong></div>
        <div><span>当前阻塞</span><strong>${escapeHtml(item.blocker || "待确认")}</strong></div>
      </div>
      <div class="field"><label for="field-application">关联应用</label><input id="field-application" name="application" value="${escapeHtml(item.application || "")}" required /></div>
      <div class="field"><label for="field-appVersion">应用版本</label><input id="field-appVersion" name="appVersion" value="${escapeHtml(item.appVersion || "")}" required /></div>
      <div class="decision-guide full">允许流转：${escapeHtml((ticketTransitionRules[item.status] || [item.status]).join(" → "))}。只有“待验证”状态在完成回归与用户反馈后才能关闭。</div>
      <div class="field"><label for="field-status">处理状态</label><select id="field-status" name="status" required>${optionMarkup(ticketTransitionRules[item.status] || [item.status], item.status)}</select></div>
      <div class="field"><label for="field-owner">负责人</label><select id="field-owner" name="owner" required>${optionMarkup(["运营-小林", "产品-周宁", "技术-陈工"], item.owner)}</select></div>
      <div class="field"><label for="field-nextUpdate">下次反馈日期</label><input id="field-nextUpdate" name="nextUpdate" type="date" value="${item.nextUpdate === "-" ? "" : escapeHtml(item.nextUpdate)}" /></div>
      <div class="field"><label for="field-impactScope">影响范围</label><input id="field-impactScope" name="impactScope" value="${escapeHtml(item.impactScope || "")}" required /></div>
      <div class="field"><label for="field-collaborationDepartment">协作部门</label><select id="field-collaborationDepartment" name="collaborationDepartment" required>${optionMarkup(["运营", "产品", "技术", "客户成功"], item.collaborationDepartment || "产品")}</select></div>
      <div class="field"><label for="field-collaborator">协作人</label><input id="field-collaborator" name="collaborator" value="${escapeHtml(item.collaborator || "")}" required /></div>
      <div class="field"><label for="field-commitmentDate">协作承诺日期</label><input id="field-commitmentDate" name="commitmentDate" type="date" value="${item.commitmentDate === "-" ? "" : escapeHtml(item.commitmentDate || "")}" /></div>
      <div class="field full"><label for="field-blocker">当前阻塞</label><textarea id="field-blocker" name="blocker" required>${escapeHtml(item.blocker || "")}</textarea></div>
      <div class="field full"><label for="field-nextAction">下一步动作</label><textarea id="field-nextAction" name="nextAction" required>${escapeHtml(item.nextAction || "")}</textarea></div>
      <div class="field full"><label for="field-actualResult">实际结果</label><textarea id="field-actualResult" name="actualResult" required>${escapeHtml(item.actualResult || "")}</textarea></div>
      <div class="field full"><label for="field-expectedResult">预期结果</label><textarea id="field-expectedResult" name="expectedResult" required>${escapeHtml(item.expectedResult || "")}</textarea></div>
      <div class="field full"><label for="field-reproduction">复现步骤</label><textarea id="field-reproduction" name="reproduction" required>${escapeHtml(item.reproduction || "")}</textarea></div>
      <div class="field full"><label for="field-initialCause">初步原因</label><textarea id="field-initialCause" name="initialCause" required>${escapeHtml(item.initialCause || "")}</textarea></div>
      <div class="field full"><label for="field-resolution">处理方案 / 结果</label><textarea id="field-resolution" name="resolution" required>${escapeHtml(item.resolution || "")}</textarea></div>
      <div class="field full"><label for="field-verification">验证记录</label><textarea id="field-verification" name="verification" required>${escapeHtml(item.verification || "")}</textarea></div>
      <div class="field full"><label for="field-userFeedback">用户反馈</label><textarea id="field-userFeedback" name="userFeedback" required>${escapeHtml(item.userFeedback || "")}</textarea><p class="field-help">关闭前应完成回归验证并向用户同步最终结果。</p></div>
      <div class="field full"><label>跨部门协作跟进时间线</label><div class="followup-timeline">${followUpMarkup}</div></div>
      <div class="dialog-section-title full"><strong>新增一条协作跟进（选填）</strong><span>动作和结果同时填写后，保存时会追加到时间线。</span></div>
      <div class="field"><label for="field-followUpAction">本次跟进动作</label><input id="field-followUpAction" name="followUpAction" placeholder="例如：催办修复排期" /></div>
      <div class="field"><label for="field-followUpCommitmentDate">新的承诺日期</label><input id="field-followUpCommitmentDate" name="followUpCommitmentDate" type="date" /></div>
      <div class="field full"><label for="field-followUpResult">协作方反馈结果</label><textarea id="field-followUpResult" name="followUpResult" placeholder="例如：已确认原因，预计明日完成修复"></textarea></div>
      <div class="field full"><label for="field-followUpNextStep">跟进后的下一步</label><input id="field-followUpNextStep" name="followUpNextStep" placeholder="例如：明日15:00前完成回归验证" /></div>`;
    if (isReadOnly) {
      fields.insertAdjacentHTML("afterbegin", `<div class="decision-guide full">该问题已经关闭，分类、优先级、处理结论和时间线均作为历史证据只读保存。</div>`);
      fields.querySelectorAll("input, select, textarea").forEach(control => { control.disabled = true; });
      submit.hidden = true;
      cancelButton.textContent = "关闭";
    }
  }
  document.querySelector("#form-dialog").showModal();
}

function nextId(prefix, list) {
  const max = list.reduce((result, item) => Math.max(result, Number(item.id.split("-")[1]) || 0), 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

function submitDialog(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const formData = new FormData(form);
  const values = Object.fromEntries(formData.entries());
  if (dialogType === "account") {
    const id = nextId("ACC", state.accounts);
    state.accounts.unshift({ id, name: values.name, department: values.department, purpose: values.purpose, role: values.role, submittedAt: new Date().toISOString(), status: "待审核", resourceScope: "待审批核定", accessExpiry: "", approvalComment: "待核验用途、资源范围和权限期限。", processedAt: "" });
    addAudit("新增账号申请", `${id} ${values.name}｜${values.department}`);
  }
  if (dialogType === "accountReview") {
    const item = state.accounts.find(account => account.id === dialogRecordId);
    if (!item) return;
    if (item.status !== "待审核") {
      showDialogError("该审批已经完成，不能重复修改。请关闭窗口查看记录。");
      return;
    }
    if (values.decision === "开通" && !values.accessExpiry) {
      showDialogError("无法开通：请先填写权限到期日。", "#field-accessExpiry");
      return;
    }
    if (values.decision === "开通" && values.accessExpiry < shortDate(0)) {
      showDialogError("无法开通：权限到期日不能早于今天。", "#field-accessExpiry");
      return;
    }
    if (!values.resourceScope?.trim() || /^待审批/.test(values.resourceScope.trim())) {
      showDialogError("无法保存：请填写明确的资源与权限范围。", "#field-resourceScope");
      return;
    }
    if (!values.approvalComment?.trim() || /^待核验/.test(values.approvalComment.trim())) {
      showDialogError("无法保存：请填写实际审批意见或驳回原因。", "#field-approvalComment");
      return;
    }
    item.role = values.role;
    item.resourceScope = values.resourceScope.trim();
    item.accessExpiry = values.decision === "开通" ? values.accessExpiry : "";
    item.approvalComment = values.approvalComment.trim();
    item.status = values.decision === "开通" ? "已开通" : "已驳回";
    item.processedAt = new Date().toISOString();
    addAudit(item.status === "已开通" ? "账号审批开通" : "账号审批驳回", `${item.id}｜${item.role}｜${item.resourceScope}｜${item.approvalComment}`);
  }
  if (dialogType === "application") {
    const id = nextId("APP", state.applications);
    const passRate = Math.min(100, Math.max(0, Number(values.passRate) || 0));
    state.applications.unshift({ id, name: values.name, type: values.type, owner: values.owner, scenario: values.scenario, passRate, risk: values.risk, testCaseCount: Number(values.testCaseCount), knowledgeSource: values.knowledgeSource, failureEvidence: values.failureEvidence, fallbackPlan: values.fallbackPlan, privacyNotes: values.privacyNotes, guideStatus: values.guideStatus, status: "待审核", version: "V1.0", submittedAt: new Date().toISOString(), reviewScores: null, vetoes: [], reviewComment: "待完成发布前审核。", reviewedAt: "", reviewHistory: [] });
    refreshApplicationMetrics(state.applications, state.metrics);
    addAudit("提交应用审核", `${id} ${values.name}｜${values.type}｜${values.testCaseCount}条测试用例｜已提交风险与兜底证据`);
  }
  if (dialogType === "appLifecycle") {
    const item = state.applications.find(application => application.id === dialogRecordId);
    if (!item) return;
    const reason = values.lifecycleReason?.trim();
    if (!reason) {
      showDialogError("请填写本次状态变更的原因或整改说明。", "#field-lifecycleReason");
      return;
    }
    const allowedStatuses = { list: ["已通过", "已下架"], unlist: ["已上架"], resubmit: ["已驳回", "待整改"] };
    if (!allowedStatuses[dialogAction]?.includes(item.status)) {
      showDialogError(`当前状态“${item.status}”不允许执行这个操作，请刷新页面后重试。`);
      return;
    }
    if (dialogAction === "resubmit") {
      const previousVersion = item.version || "V1.0";
      item.version = incrementVersion(previousVersion);
      item.status = "待审核";
      item.submittedAt = new Date().toISOString();
      item.reviewScores = null;
      item.vetoes = [];
      item.reviewComment = `整改说明：${reason}`;
      item.reviewedAt = "";
      item.lifecycleReason = reason;
      addAudit("应用重新提交", `${item.id} ${previousVersion} → ${item.version}｜整改说明：${reason}｜历史审核记录保留`);
    } else {
      item.status = dialogAction === "list" ? "已上架" : "已下架";
      item.lifecycleReason = reason;
      addAudit(dialogAction === "list" ? "应用上架" : "应用下架", `${item.id} ${item.name}｜${reason}`);
    }
  }
  if (dialogType === "ticket") {
    const id = nextId("ISS", state.tickets);
    const createdAt = new Date().toISOString();
    const newTicket = { id, user: values.user, title: values.title, description: values.description, category: values.category, priority: values.priority, owner: values.owner, status: "待确认", createdAt, nextUpdate: values.nextUpdate, resolution: "待确认问题原因与处理方案", application: "待确认", appVersion: "待确认", actualResult: values.description, expectedResult: "待补充", reproduction: "待补充完整复现步骤", impactScope: "待确认", initialCause: "待完成初步排查", verification: "待处理后回归验证", userFeedback: "待反馈最终结果", slaDueAt: addHours(createdAt, slaHoursByPriority[values.priority]), firstResponseAt: "", slaBreached: null, responseChannel: "", responseContent: "", initialAssessment: "", escalatedTo: "", closedAt: "" };
    const collaboration = getCollaborationDefaults(newTicket);
    Object.assign(newTicket, { collaborationDepartment: collaboration.department, collaborator: collaboration.collaborator, blocker: getCategoryBlocker(values.category), commitmentDate: values.nextUpdate, nextAction: "收集完整复现信息并确认影响范围", lastFollowUpAt: createdAt });
    newTicket.followUps = [{ id: crypto.randomUUID(), at: createdAt, from: "运营-小林", to: newTicket.collaborator, action: "登记问题并分派协作方", result: "已进入问题台账，等待协作方确认", nextStep: newTicket.nextAction, commitmentDate: newTicket.commitmentDate }];
    state.tickets.unshift(newTicket);
    addAudit("登记用户问题", `${id} ${values.title}`);
  }
  if (dialogType === "ticketResponse") {
    const item = state.tickets.find(ticket => ticket.id === dialogRecordId);
    if (!item) return;
    if (item.firstResponseAt) {
      showDialogError("该问题已经记录首次响应，不能重复覆盖历史记录。");
      return;
    }
    item.firstResponseAt = new Date().toISOString();
    item.slaBreached = new Date(item.firstResponseAt) > new Date(item.slaDueAt);
    item.responseChannel = values.responseChannel;
    item.responseContent = values.responseContent.trim();
    item.initialAssessment = values.initialAssessment.trim();
    item.escalatedTo = values.escalatedTo.trim();
    item.nextUpdate = values.nextUpdate;
    const followUp = {
      id: crypto.randomUUID(), at: item.firstResponseAt, from: "运营-小林", to: item.escalatedTo,
      action: `通过${item.responseChannel}完成首次响应并升级协作`, result: item.responseContent,
      nextStep: `依据初步判断继续定位，并在${item.nextUpdate}前同步进展`, commitmentDate: item.nextUpdate
    };
    item.followUps ||= [];
    item.followUps.push(followUp);
    item.followUps.sort((a, b) => new Date(a.at) - new Date(b.at));
    item.lastFollowUpAt = item.followUps.at(-1)?.at || item.firstResponseAt;
    addAudit("记录首次响应", `${item.id}｜${item.responseChannel}｜升级至${item.escalatedTo}｜${item.slaBreached ? "超过" : "符合"}${item.priority}首次响应SLA`);
  }
  if (dialogType === "faq") {
    if (values.sourceIssue && values.sourceIssue !== "-") {
      const sourceTicket = state.tickets.find(ticket => ticket.id === values.sourceIssue);
      if (!sourceTicket || sourceTicket.status !== "已关闭") {
        showDialogError("来源问题必须是已经完成验证和用户反馈的已关闭问题；手工整理请留空。", "#field-sourceIssue");
        return;
      }
    }
    if (values.sourceIssue && values.sourceIssue !== "-" && state.faqs.some(faq => faq.sourceIssue === values.sourceIssue)) {
      showDialogError(`${values.sourceIssue} 已经沉淀为FAQ，无需重复创建。`, "#field-sourceIssue");
      return;
    }
    const id = nextId("FAQ", state.faqs);
    state.faqs.unshift({ id, category: values.category, question: values.question, answer: values.answer, updatedAt: shortDate(0), sourceIssue: values.sourceIssue || "-" });
    addAudit(values.sourceIssue && values.sourceIssue !== "-" ? "从问题沉淀FAQ" : "新增FAQ", `${id}｜来源${values.sourceIssue || "人工整理"}｜${values.question}`);
  }
  if (dialogType === "appReview") {
    const item = state.applications.find(application => application.id === dialogRecordId);
    if (!item) return;
    if (!item.testCaseCount || !item.failureEvidence || !item.knowledgeSource || !item.fallbackPlan || !item.privacyNotes) {
      showDialogError("审核证据不完整：请先补充测试样本、数据来源、失败证据、兜底和隐私说明。");
      return;
    }
    item.reviewScores = Object.fromEntries(reviewDimensions.map(dimension => [dimension.key, Math.min(dimension.max, Math.max(0, Number(values[`score_${dimension.key}`]) || 0))]));
    item.vetoes = formData.getAll("veto");
    item.reviewComment = values.reviewComment;
    const score = getReviewScore(item);
    item.status = item.vetoes.length ? "已驳回" : score >= 85 ? "已通过" : score >= 70 ? "待整改" : "已驳回";
    item.reviewedAt = new Date().toISOString();
    item.reviewHistory ||= [];
    item.reviewHistory.push({ version: item.version || "V1.0", reviewedAt: item.reviewedAt, score, result: item.status, vetoes: [...item.vetoes], comment: item.reviewComment });
    addAudit("完成应用审核", `${item.id} 得分${score}｜一票否决${item.vetoes.length}项｜结论：${item.status}`);
  }
  if (dialogType === "ticketDetail") {
    const item = state.tickets.find(ticket => ticket.id === dialogRecordId);
    if (!item) return;
    if (item.status === "已关闭") {
      showDialogError("该问题已经关闭，闭环记录不能再次修改。请关闭窗口查看记录。");
      return;
    }
    const previous = item.status;
    const allowedTransitions = ticketTransitionRules[previous] || [previous];
    if (!allowedTransitions.includes(values.status)) {
      showDialogError(`无法从“${previous}”直接变为“${values.status}”。请按复现、处理、验证的顺序推进。`, "#field-status");
      return;
    }
    if (["已复现", "处理中", "待验证"].includes(values.status) && /待补充|待确认/.test(values.reproduction)) {
      showDialogError("推进状态前，请先填写可以实际执行的复现步骤。", "#field-reproduction");
      return;
    }
    if (["处理中", "待验证"].includes(values.status) && /待完成|待确认|尚未/.test(values.initialCause)) {
      showDialogError("进入处理阶段前，请先填写明确的初步原因。", "#field-initialCause");
      return;
    }
    if (values.status === "待验证" && /待|尚未/.test(values.resolution)) {
      showDialogError("进入待验证前，请先填写已经实施的处理方案或结果。", "#field-resolution");
      return;
    }
    if (values.status === "已关闭" && !item.firstResponseAt) {
      showDialogError("无法关闭：请先在问题列表中记录首次响应。", "#field-status");
      return;
    }
    if (values.status === "已关闭" && (/待|尚未/.test(values.verification) || /待|尚未/.test(values.userFeedback))) {
      showDialogError("无法关闭：请先填写已完成的回归验证和用户反馈。", "#field-verification");
      return;
    }
    if ((values.followUpAction && !values.followUpResult) || (!values.followUpAction && values.followUpResult)) {
      showDialogError("新增跟进时，需要同时填写“本次跟进动作”和“协作方反馈结果”。", values.followUpAction ? "#field-followUpResult" : "#field-followUpAction");
      return;
    }
    ["application", "appVersion", "status", "owner", "impactScope", "collaborationDepartment", "collaborator", "blocker", "nextAction", "actualResult", "expectedResult", "reproduction", "initialCause", "resolution", "verification", "userFeedback"].forEach(field => { item[field] = values[field]; });
    item.nextUpdate = item.status === "已关闭" ? "-" : (values.nextUpdate || shortDate(1));
    item.commitmentDate = item.status === "已关闭" ? "-" : (values.commitmentDate || item.nextUpdate);
    if (values.followUpAction && values.followUpResult) {
      const followUpAt = new Date().toISOString();
      const followUpCommitment = item.status === "已关闭" ? "-" : (values.followUpCommitmentDate || item.commitmentDate);
      item.followUps ||= [];
      item.followUps.push({ id: crypto.randomUUID(), at: followUpAt, from: "运营-小林", to: item.collaborator, action: values.followUpAction, result: values.followUpResult, nextStep: values.followUpNextStep || item.nextAction, commitmentDate: followUpCommitment });
      item.lastFollowUpAt = followUpAt;
      if (item.status !== "已关闭" && values.followUpCommitmentDate) item.commitmentDate = values.followUpCommitmentDate;
      if (values.followUpNextStep) item.nextAction = values.followUpNextStep;
      addAudit("新增协作跟进", `${item.id}｜${item.collaborator}｜${values.followUpAction}｜${values.followUpResult}`);
    }
    if (item.status === "已关闭" && !item.closedAt) {
      item.closedAt = new Date().toISOString();
      item.followUps ||= [];
      item.followUps.push({ id: crypto.randomUUID(), at: item.closedAt, from: "运营-小林", to: item.collaborator, action: "完成回归验证并同步用户", result: item.userFeedback, nextStep: "评估是否沉淀FAQ并纳入周报", commitmentDate: "-" });
      item.followUps.sort((a, b) => new Date(a.at) - new Date(b.at));
      item.lastFollowUpAt = item.closedAt;
    }
    if (item.status === "已关闭") item.blocker = "无，已完成验证与用户反馈";
    if (item.status !== "已关闭") item.closedAt = "";
    addAudit("保存问题闭环记录", `${item.id} ${previous} → ${item.status}｜已更新原因、处理、验证和用户反馈`);
  }
  document.querySelector("#form-dialog").close();
  form.reset();
  dialogType = null;
  dialogRecordId = null;
  dialogAction = null;
  renderAll();
  showToast("记录已保存");
}

function downloadText(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`已生成下载文件：${filename}`);
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function exportTickets() {
  const headers = ["问题编号", "创建时间", "匿名用户", "关联应用", "应用版本", "标题", "类型", "优先级", "负责人", "状态", "SLA截止", "首次响应", "SLA结果", "响应渠道", "首次回复内容", "首次初判", "升级协作人", "下次反馈", "协作部门", "协作人", "当前阻塞", "承诺日期", "下一步动作", "最后跟进时间", "跟进次数", "影响范围", "实际结果", "预期结果", "复现步骤", "初步原因", "处理结果", "验证记录", "用户反馈", "关闭时间"];
  const rows = state.tickets.map(item => [item.id, item.createdAt, item.user, item.application, item.appVersion, item.title, item.category, item.priority, item.owner, item.status, item.slaDueAt, item.firstResponseAt, getSlaStatus(item).label, item.responseChannel, item.responseContent, item.initialAssessment, item.escalatedTo, item.nextUpdate, item.collaborationDepartment, item.collaborator, item.blocker, item.commitmentDate, item.nextAction, item.lastFollowUpAt, (item.followUps || []).length, item.impactScope, item.actualResult, item.expectedResult, item.reproduction, item.initialCause, item.resolution, item.verification, item.userFeedback, item.closedAt]);
  downloadText(`智能体平台当前问题台账-${shortDate(0)}.csv`, `\ufeff${[headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n")}`, "text/csv;charset=utf-8");
}

function exportFollowUps() {
  const headers = ["问题编号", "问题标题", "跟进时间", "发起人", "协作对象", "跟进动作", "协作方反馈", "下一步", "承诺日期"];
  const rows = state.tickets.flatMap(ticket => (ticket.followUps || []).map(record => [ticket.id, ticket.title, record.at, record.from, record.to, record.action, record.result, record.nextStep, record.commitmentDate]));
  downloadText(`智能体平台当前协作跟进-${shortDate(0)}.csv`, `\ufeff${[headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n")}`, "text/csv;charset=utf-8");
}

function exportApplications() {
  refreshApplicationMetrics(state.applications, state.metrics);
  const headers = ["应用ID", "应用名称", "类型", "版本", "状态", "风险", "测试通过率", "测试用例数", "知识或数据来源", "失败样本证据", "异常兜底", "隐私与权限", "使用指引", "审核得分", "60日调用量", "成功率", "负反馈率", "平均响应秒数", "知识库未命中率", "人工介入次数", "健康判断", "建议动作"];
  const rows = state.applications.map(item => {
    const health = getApplicationHealth(item);
    return [item.id, item.name, item.type, item.version, item.status, item.risk, `${item.passRate}%`, item.testCaseCount, item.knowledgeSource, item.failureEvidence, item.fallbackPlan, item.privacyNotes, item.guideStatus, getReviewScore(item) ?? "待审核", item.callVolume, `${(item.successRate * 100).toFixed(1)}%`, `${(item.negativeRate * 100).toFixed(1)}%`, item.responseSeconds, item.kbMissRate === null ? "不适用" : `${(item.kbMissRate * 100).toFixed(1)}%`, item.manualInterventions, health.label, health.action];
  });
  downloadText(`智能体平台当前应用运营-${shortDate(0)}.csv`, `\ufeff${[headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n")}`, "text/csv;charset=utf-8");
}

function exportMetrics() {
  const headers = ["日期", "调用次数", "活跃用户"];
  const rows = state.metrics.map(item => [item.date, item.calls, item.activeUsers]);
  downloadText(`智能体平台当前运营指标-${shortDate(0)}.csv`, `\ufeff${[headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n")}`, "text/csv;charset=utf-8");
}

function attachEvents() {
  document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
  document.querySelector("#account-table").addEventListener("click", handleAccountAction);
  document.querySelector("#application-table").addEventListener("click", handleApplicationAction);
  document.querySelector("#ticket-table").addEventListener("click", handleTicketClick);
  document.querySelector("#ticket-table").addEventListener("change", handleTicketChange);

  ["account-search", "account-status-filter"].forEach(id => document.querySelector(`#${id}`).addEventListener("input", () => { tablePages.accounts = 1; renderAccounts(); }));
  ["app-search", "app-status-filter"].forEach(id => document.querySelector(`#${id}`).addEventListener("input", () => { tablePages.applications = 1; renderApplications(); }));
  ["ticket-search", "ticket-category-filter", "ticket-priority-filter", "ticket-status-filter"].forEach(id => document.querySelector(`#${id}`).addEventListener("input", () => { tablePages.tickets = 1; renderTickets(); }));
  document.querySelectorAll(".pagination").forEach(container => container.addEventListener("click", event => {
    const button = event.target.closest("[data-page-key]");
    if (!button || button.disabled) return;
    tablePages[button.dataset.pageKey] = Number(button.dataset.page);
    ({ accounts: renderAccounts, applications: renderApplications, tickets: renderTickets })[button.dataset.pageKey]?.();
  }));

  document.querySelector("#add-account-button").addEventListener("click", () => openDialog("account"));
  document.querySelector("#add-application-button").addEventListener("click", () => openDialog("application"));
  document.querySelector("#add-ticket-button").addEventListener("click", () => openDialog("ticket"));
  document.querySelector("#add-faq-button").addEventListener("click", () => openDialog("faq"));
  document.querySelector("#dynamic-form").addEventListener("submit", submitDialog);
  document.querySelector("#dynamic-form").addEventListener("input", clearDialogError);
  document.querySelector("#dynamic-form").addEventListener("change", clearDialogError);
  document.querySelectorAll("[data-dialog-close]").forEach(button => button.addEventListener("click", () => {
    document.querySelector("#form-dialog").close();
    document.querySelector("#dynamic-form").reset();
    dialogType = null;
    dialogRecordId = null;
    dialogAction = null;
  }));

  document.querySelector("#export-tickets").addEventListener("click", exportTickets);
  document.querySelector("#export-followups").addEventListener("click", exportFollowUps);
  document.querySelector("#regenerate-metrics").addEventListener("click", () => {
    if (!window.confirm("确定重新生成60天调用和活跃用户数据吗？当前指标数据将被替换。")) return;
    state.metrics = generateMetrics(60);
    refreshApplicationMetrics(state.applications, state.metrics);
    addAudit("重新生成运营指标", "已生成近60天模拟调用量和活跃用户数据");
    renderAll();
    resetReportVerification();
    showToast("已重新生成60天模拟数据");
  });
  document.querySelector("#export-metrics").addEventListener("click", exportMetrics);
  document.querySelector("#export-applications").addEventListener("click", exportApplications);
  document.querySelector("#analytics-range").addEventListener("input", () => {
    renderAnalytics();
    resetReportVerification();
  });
  document.querySelectorAll("[data-report-check]").forEach(check => check.addEventListener("change", syncReportVerification));
  document.querySelector("#report-reviewer").addEventListener("input", syncReportVerification);
  document.querySelector("#download-report").addEventListener("click", () => {
    if (document.querySelector("#download-report").disabled) {
      showToast("请先完成6项人工核验并填写核验人");
      return;
    }
    const days = Number(document.querySelector("#analytics-range").value || 60);
    downloadText(`智能体平台运营${days}日简报-模拟.md`, document.querySelector("#report-preview").value, "text/markdown;charset=utf-8");
    addAudit("完成周报人工核验", `${document.querySelector("#report-reviewer").value.trim()}｜${days}日简报｜6项检查完成`);
    renderAudit();
    saveState();
  });
  document.querySelector("#report-preview").addEventListener("input", resetReportVerification);
  document.querySelector("#download-guide").addEventListener("click", () => {
    downloadText("AgentOps-Desk-平台使用说明.md", buildPlatformGuide(), "text/markdown;charset=utf-8");
    addAudit("下载平台使用说明", "已导出平台介绍、术语、SLA和操作路径");
    renderAudit();
    saveState();
  });
  document.querySelector("#reset-demo").addEventListener("click", () => {
    if (!window.confirm("确定重置全部演示操作吗？本地修改将被清除。")) return;
    state = createSeedData();
    localStorage.removeItem(STORAGE_KEY);
    LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
    renderAll();
    setView("dashboard");
    showToast("演示数据已重置");
  });
}

document.querySelector("#today-label").textContent = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date());
attachEvents();
renderAll();
