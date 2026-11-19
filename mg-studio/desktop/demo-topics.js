'use strict';

const topics = {
  pfa: {
    topic: '心房颤动脉冲电场消融',
    citation: {
      title: 'Pulsed Field or Conventional Thermal Ablation for Paroxysmal Atrial Fibrillation',
      url: 'https://pubmed.ncbi.nlm.nih.gov/37634148/',
      id: 'pmid_37634148', doi: '10.1056/NEJMoa2307291', year: '2023', source: 'PubMed'
    },
    claims: [
      'ADVENT 试验在阵发性房颤患者中比较了脉冲电场消融与传统热消融。',
      '研究分别评价治疗效果和安全性，主要疗效终点包含心律失常复发等事件。'
    ]
  },
  ami: {
    topic: '心梗再灌注的救治时间',
    citation: {
      title: '2023 ESC Guidelines for the management of acute coronary syndromes',
      url: 'https://academic.oup.com/eurheartj/article/44/38/3720/7243210',
      doi: '10.1093/eurheartj/ehad191', year: '2023', source: 'ESC'
    },
    claims: [
      '欧洲心脏病学会的急性冠脉综合征指南区分了发病、诊断和再灌注三个时间节点。',
      '指南中讨论的 120 分钟，从确诊 ST 段抬高型心肌梗死算到介入再灌注。'
    ]
  },
  hypertension: {
    topic: '高血压长期用药与随访',
    citation: {
      title: '2024 ESC Guidelines for the management of elevated blood pressure and hypertension',
      url: 'https://academic.oup.com/eurheartj/article/45/38/3912/7741010',
      doi: '10.1093/eurheartj/ehae178', year: '2024', source: 'ESC'
    },
    claims: [
      '高血压指南把家庭血压记录纳入持续管理，与诊室测量一起帮助了解血压变化。',
      '维持服药依从性是长期管理的一部分，随访时可和医生讨论副作用及执行用药方案的困难。'
    ]
  },
  cpr: {
    topic: '徒手心肺复苏',
    template: 'teaching',
    citation: {
      title: 'Hands-Only CPR',
      url: 'https://cpr.heart.org/en/cpr-courses-and-kits/hands-only-cpr',
      source: 'American Heart Association'
    },
    claims: [
      '美国心脏协会的徒手心肺复苏课程，面向目睹青少年或成人突然倒地的旁观者。',
      '课程从呼叫当地急救服务和实施胸外按压两个动作展开。'
    ]
  }
};

module.exports = topics;
