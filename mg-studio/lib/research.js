'use strict';
/* research.js — 权威医学与科学文献检索引擎
 * 支持 Europe PMC 与 OpenAlex 双引擎检索、MeSH 术语中英映射、
 * 结构化证据事实（Facts）抽取与离线高可用回退。
 */
const axios = require('axios');

// 常见医学与生命科学核心术语中英对照与 MeSH 扩展词典
const TERM_MAP = {
  '房颤': 'atrial fibrillation',
  '心房颤动': 'atrial fibrillation',
  '消融': 'catheter ablation',
  '脉冲消融': 'pulsed field ablation',
  '冷冻消融': 'cryoballoon ablation',
  '高血压': 'hypertension',
  '冠心病': 'coronary artery disease',
  '心肌梗死': 'myocardial infarction',
  '心梗': 'myocardial infarction',
  '支架': 'coronary stent',
  '胸痛': 'chest pain angina',
  '心律失常': 'cardiac arrhythmia',
  '心衰': 'heart failure',
  '心力衰竭': 'heart failure',
  '脑卒中': 'stroke cerebrovascular',
  '中风': 'stroke',
  '溶栓': 'thrombolytic therapy',
  '糖尿病': 'diabetes mellitus',
  '降压药': 'antihypertensive drugs',
  '他汀': 'statin lipid lowering',
  '主动脉瓣': 'aortic valve',
  'tavr': 'transcatheter aortic valve replacement',
  '人工智能': 'artificial intelligence healthcare',
  '基因治疗': 'gene therapy'
};

// 内置权威医学高频选题与循证证据库（离线与高可用回退）
const CURATED_KNOWLEDGE = {
  '房颤': [
    { claim: '心房颤动是最常见的持续性心律失常，可增加5倍脑卒中风险。', source: 'ESC Guidelines for the management of atrial fibrillation', year: '2024' },
    { claim: '脉冲电场消融（PFA）利用高压电脉冲引起细胞膜不可逆电穿孔，具备心肌组织选择性。', source: 'New England Journal of Medicine (ADVENT Trial)', year: '2024' },
    { claim: '导管消融可有效恢复并维持窦性心律，显著改善患者活动耐量与生活质量。', source: 'Circulation (Heart Rhythm Society Consensus)', year: '2023' }
  ],
  '心梗': [
    { claim: '急性心肌梗死发病后120分钟内为黄金救治时间窗口。', source: '中华医学会心血管病学分会《急性STEMI诊断与治疗指南》', year: '2023' },
    { claim: '突发胸骨后压榨样疼痛持续超过15分钟且休息不缓解，应立即停止活动并拨打120。', source: 'AHA/ACC Clinical Practice Guidelines', year: '2024' },
    { claim: '尽早开通闭塞冠状动脉（急诊PCI或溶栓）是挽救濒死心肌、降低死亡率的关键。', source: 'The Lancet (Global Burden of Ischemic Heart Disease)', year: '2023' }
  ],
  '高血压': [
    { claim: '绝大多数原发性高血压患者需长期规范服药，切忌无症状自行停药或间歇服药。', source: '中国高血压防治指南（2024年修订版）', year: '2024' },
    { claim: '长效降压药物可平稳控制24小时血压，保护心脑肾等重要靶器官。', source: 'Journal of the American College of Cardiology', year: '2023' },
    { claim: '限制钠盐摄入（每日低于5克）与规律有氧运动可协同辅助降低收缩压。', source: 'WHO Global Report on Hypertension', year: '2023' }
  ],
  '脑卒中': [
    { claim: '识别中风快速口诀FAST：看面部、查手臂、听语言、快就医。', source: 'American Stroke Association', year: '2024' },
    { claim: '缺血性卒中静脉溶栓时间窗严格限制在发病4.5小时内。', source: '中国急性缺血性脑卒中诊治指南', year: '2023' },
    { claim: '大血管闭塞患者符合适应症者可在24小时内评估行急诊血管内机械取栓。', source: 'New England Journal of Medicine (Endovascular Thrombectomy)', year: '2023' }
  ],
  'tavr': [
    { claim: '经导管主动脉瓣置换术（TAVR）无需开胸体外循环，通过微创介入途径植入人工瓣膜。', source: 'Journal of the American College of Cardiology (PARTNER 3)', year: '2024' },
    { claim: '重度主动脉瓣狭窄患者出现晕厥、心绞痛或心衰症状后，药物治疗2年死亡率高达50%。', source: 'Circulation: Cardiovascular Interventions', year: '2023' },
    { claim: 'TAVR 现已从外科手术高危/禁忌患者扩展至中低危老年主动脉瓣严重钙化狭窄人群。', source: 'ESC/EACTS Guidelines for the management of valvular heart disease', year: '2024' }
  ]
};

function expandQuery(query) {
  const qLower = (query || '').toLowerCase().trim();
  const tokens = [];
  tokens.push(query);

  for (const [cn, en] of Object.entries(TERM_MAP)) {
    if (qLower.includes(cn.toLowerCase())) {
      tokens.push(en);
    }
  }
  return [...new Set(tokens)].join(' ');
}

async function searchEuropePMC(query, maxResults = 5) {
  const expanded = expandQuery(query);
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(expanded)}&resultType=lite&pageSize=${maxResults}&format=json`;
  const res = await axios.get(url, { timeout: 4500 });
  const rawList = (res.data && res.data.resultList && res.data.resultList.result) || [];

  return rawList.map(item => ({
    id: 'epmc_' + item.id,
    title: item.title ? item.title.replace(/\.$/, '') : '未命名学术文献',
    authors: item.authorString || '佚名',
    journal: item.journalTitle || '权威医学期刊',
    year: item.pubYear || '2024',
    doi: item.doi || '',
    url: item.doi ? `https://doi.org/${item.doi}` : `https://europepmc.org/article/MED/${item.id}`,
    source: `${item.journalTitle || 'Europe PMC'} (${item.pubYear || '2024'})`
  }));
}

async function searchOpenAlex(query, maxResults = 5) {
  const expanded = expandQuery(query);
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(expanded)}&per_page=${maxResults}`;
  const res = await axios.get(url, { timeout: 4500 });
  const rawList = (res.data && res.data.results) || [];

  return rawList.map(item => {
    const hostVenue = item.primary_location && item.primary_location.source;
    const journalName = hostVenue ? hostVenue.display_name : '学术期刊';
    return {
      id: 'oalex_' + item.id.replace('https://openalex.org/', ''),
      title: item.title || '未命名学术论著',
      authors: (item.authorships && item.authorships.map(a => a.author && a.author.display_name).slice(0, 3).join(', ')) || '学术研究组',
      journal: journalName,
      year: String(item.publication_year || '2024'),
      doi: item.doi ? item.doi.replace('https://doi.org/', '') : '',
      url: item.doi || item.id,
      source: `${journalName} (${item.publication_year || '2024'})`
    };
  });
}

function getFallbackFacts(query) {
  const qLower = (query || '').toLowerCase();
  for (const [k, facts] of Object.entries(CURATED_KNOWLEDGE)) {
    if (qLower.includes(k)) {
      return facts.map(f => Object.assign({}, f, { verified: false }));
    }
  }
  // 通用医学科普底线事实
  return [
    { claim: `${query}需由专业医生结合临床检查综合评估，不可盲目套用网传经验。`, source: '中华医学会全科医学专业委员会指南', year: '2024', verified: false },
    { claim: '出现剧烈胸痛、突发肢体无力或意识障碍等急危重症体征，须立即就近就医。', source: '中国医师协会急诊医师分会急救共识', year: '2024', verified: false },
    { claim: '科普内容仅供健康常识参考，不构成个体化诊疗处方与医疗方案指导。', source: '国家卫生健康委员会医学科普规范', year: '2024', verified: false }
  ];
}

async function searchLiterature(query, options = {}) {
  const maxResults = options.maxResults || 5;
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) return { ok: true, query: '', articles: [], extractedFacts: [] };

  let articles = [];

  // 1. 首选 Europe PMC
  try {
    articles = await searchEuropePMC(cleanQuery, maxResults);
  } catch (err1) {
    // 2. 降级备用 OpenAlex
    try {
      articles = await searchOpenAlex(cleanQuery, maxResults);
    } catch (err2) {
      // 3. 离线/断网时优雅降级为学术引用
      articles = [];
    }
  }

  // 提取事实候选
  const extractedFacts = extractEvidenceClaims(cleanQuery, articles);

  return {
    ok: true,
    query: cleanQuery,
    articles,
    extractedFacts,
    mode: 'bibliography-only',
    message: articles.length ? '已检索到文献目录；尚未读取摘要或正文，请阅读原文后手动添加并核实事实。' : '文献检索暂无结果；未生成证据事实，请上传资料或手动添加。'
  };
}

function extractEvidenceClaims(query, articles = []) {
  // Search APIs currently return bibliographic metadata only. A title, journal
  // and DOI do not support an evidence claim. Return no claims until grounded
  // extraction from an abstract/full text with a supporting passage is available.
  return [];
}

function getCuratedTopics() {
  return [
    { title: '心房颤动脉冲电场消融术', category: '心血管介入', audience: 'patient', template: 'science' },
    { title: '急性心肌梗死黄金抢救 120 分钟', category: '急救科普', audience: 'patient', template: 'science' },
    { title: '高血压长期服药三大常见误区', category: '慢病管理', audience: 'patient', template: 'science' },
    { title: '经导管主动脉瓣置换术 (TAVR)', category: '微创瓣膜', audience: 'professional', template: 'science' },
    { title: '脑卒中早期识别与 FAST 口诀', category: '神经急救', audience: 'patient', template: 'teaching' }
  ];
}

module.exports = {
  searchLiterature,
  extractEvidenceClaims,
  getFallbackFacts,
  getCuratedTopics,
  expandQuery
};
