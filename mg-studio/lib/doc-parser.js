'use strict';
/**
 * doc-parser.js — 用户自定义参考资料上传与智能文档解析引擎 (M8)
 *
 * 支持解析 PDF、DOCX、Markdown、纯文本及直接粘贴的长篇医学指南/文献。
 * 智能抽取核心主题、受众定位、关键数据指标、临床证据与结构化事实清单。
 */

const path = require('path');
let mammoth = null;
let pdfParse = null;

try {
  mammoth = require('mammoth');
} catch (e) {
  // 可选降级
}

try {
  const p = require('pdf-parse');
  pdfParse = p.PDFParse || p;
} catch (e) {
  // 可选降级
}

/**
 * 从不同格式的 Buffer 或字符串中解包出纯文本正文
 * @param {Object} options
 * @param {string} [options.filename] 文件名（根据扩展名判断格式）
 * @param {Buffer} [options.buffer] 二进制 Buffer
 * @param {string} [options.textContent] 直接传递的文本字符串
 * @returns {Promise<string>} 解码后的纯文本内容
 */
async function extractRawText({ filename = '', buffer = null, textContent = '' } = {}) {
  if (textContent && typeof textContent === 'string' && textContent.trim()) {
    return textContent.trim();
  }

  if (!buffer) return '';

  const ext = path.extname(filename).toLowerCase();

  // 1. DOCX 文件处理
  if (ext === '.docx' || ext === '.doc') {
    if (!mammoth) {
      throw new Error('未安装 mammoth 模块，无法解析 Word 文档');
    }
    const result = await mammoth.extractRawText({ buffer });
    return result.value ? result.value.trim() : '';
  }

  // 2. PDF 文件处理
  if (ext === '.pdf') {
    if (!pdfParse) {
      throw new Error('未安装 pdf-parse 模块，无法解析 PDF 文档');
    }
    if (typeof pdfParse === 'function' && pdfParse.prototype && pdfParse.prototype.getText) {
      const parser = new pdfParse({ data: buffer });
      const res = await parser.getText();
      if (typeof parser.destroy === 'function') await parser.destroy();
      return (res && (res.text || res.value)) ? String(res.text || res.value).trim() : '';
    } else if (typeof pdfParse === 'function') {
      const data = await pdfParse(buffer);
      return data.text ? data.text.trim() : '';
    }
  }

  // 3. 默认按 UTF-8 文本解析 (.txt, .md, .markdown, .json, .csv 等)
  return buffer.toString('utf8').trim();
}

/**
 * 智能分析文档文本，提取主题、受众、核心事实与关键指标
 * @param {string} text 文档纯文本
 * @param {string} [filename='自定义资料'] 文件名
 * @returns {Object} 结构化分析结果
 */
function analyzeDocumentText(text, filename = '自定义参考资料') {
  if (!text || typeof text !== 'string') {
    return {
      textLength: 0,
      suggestedTopic: '未命名主题',
      suggestedAudience: 'general',
      suggestedTemplate: 'science',
      facts: [],
      summary: '',
      keywords: []
    };
  }

  const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. 推断建议主题 (suggestedTopic)
  let suggestedTopic = '';
  // 优先取 Markdown 一级标题
  const h1Match = cleanText.match(/^#\s+(.+)$/m);
  if (h1Match && h1Match[1]) {
    suggestedTopic = h1Match[1].trim();
  } else if (lines.length > 0 && lines[0].length >= 3 && lines[0].length <= 50 && !/^(引言|前言|摘要|背景|目录)/i.test(lines[0])) {
    suggestedTopic = lines[0];
  } else {
    // 从正文前部提取典型医学/科技命名短语
    const topicPattern = /([\u4e00-\u9fa5A-Za-z0-9_]{3,20}(?:消融术?|置换术?|移植术?|治疗规范|临床指南|专家共识|干预措施|并发症预防|早期识别|机制研究|系统设计))/;
    const match = cleanText.slice(0, 500).match(topicPattern);
    if (match && match[1]) {
      suggestedTopic = match[1];
    } else {
      const base = path.basename(filename, path.extname(filename));
      suggestedTopic = base && base !== 'undefined' ? base : '自定义医学科普主题';
    }
  }

  // 2. 评估受众层级 (suggestedAudience)
  const professionalKeywords = [
    'p值', '置信区间', '单中心', '随机双盲', '多中心', '靶点', '受体', '电生理', '穿刺',
    '转录组', '病理切片', '给药剂量', '肌酐清除率', '内皮细胞', '跨膜电位', '前瞻性队列', 'cox回归'
  ];
  const patientKeywords = [
    '遵医嘱', '就医', '门诊', '注意事项', '康复', '日常护理', '生活方式', '饮食',
    '挂号', '早期信号', '自测', '家庭护理', '怎么吃药', '危险信号', '患者'
  ];

  let profScore = 0;
  for (const kw of professionalKeywords) {
    if (cleanText.includes(kw)) profScore++;
  }
  let patScore = 0;
  for (const kw of patientKeywords) {
    if (cleanText.includes(kw)) patScore++;
  }

  let suggestedAudience = 'general';
  if (patScore > profScore && patScore >= 2) {
    suggestedAudience = 'patient';
  } else if (profScore >= 2) {
    suggestedAudience = 'professional';
  } else if (patScore >= 1) {
    suggestedAudience = 'patient';
  }

  // 3. 推断叙事模板 (suggestedTemplate)
  let suggestedTemplate = 'science';
  if (/(操作步骤|实施步骤|标准操作规程|拆解步骤|分步指南|操作流程|手法要领)/.test(cleanText)) {
    suggestedTemplate = 'teaching';
  } else if (/(产品特性|器械参数|系统架构|上市发布|产品规格|核心优势)/.test(cleanText)) {
    suggestedTemplate = 'product';
  }

  // 4. 抽取关键证据与结构化事实清单 (facts)
  // 切分为单句候选集
  const rawSentences = cleanText.split(/[。！？\n;；]/)
    .map(s => s.trim())
    .filter(s => s.length >= 10 && s.length <= 120);

  const factCandidates = [];

  const statRegex = /\d+(\.\d+)?%|\d+\s*[-~至到]\s*\d+|\d+:\d+|\d+\s*(?:例|倍|min|次|cm|mm|bpm|mmHg|mg|ml|分钟|小时|天|周|月|年)|p\s*[<>=]\s*0\.\d+/i;
  const claimRegex = /(有效率|成功率|发生率|并发症|死亡率|安全性|显著降低|显著提升|明显改善|证实|表明|指出|推荐|共识|一线治疗|金标准|突破|显著差异|步骤|流程|评估|操作|要求|保持)/;
  const mechanismRegex = /(机制|机理|穿孔|凋亡|电隔离|阻断|抑制|激活|通路|靶向|选择性|离子通道|生理)/;
  const warningRegex = /(禁忌|警惕|不良反应|禁用|不可|切勿|避免|严格执行)/;

  const seen = new Set();

  for (const sentence of rawSentences) {
    // 过滤掉包含过多标点或 Markdown 语法的噪音
    if (sentence.startsWith('#') || sentence.startsWith('*') || sentence.startsWith('-')) continue;
    if (seen.has(sentence)) continue;

    let score = 0;
    if (statRegex.test(sentence)) score += 3; // 包含统计/百分比数据
    if (claimRegex.test(sentence)) score += 2; // 包含关键论断词
    if (mechanismRegex.test(sentence)) score += 2; // 包含机理机制词
    if (warningRegex.test(sentence)) score += 2; // 包含警示/禁忌词

    if (score >= 2) {
      seen.add(sentence);
      factCandidates.push({
        sentence,
        score
      });
    }
  }

  // 按得分由高到低排序，提取前 6~10 条
  factCandidates.sort((a, b) => b.score - a.score);
  const selectedFacts = factCandidates.slice(0, 8).map(item => ({
    claim: item.sentence,
    statement: item.sentence,
    evidence: `用户资料: ${filename}`,
    verified: true, // 用户自主上传并选用的资料默认为已核验事实
    isUserDoc: true
  }));

  // 5. 关键词提炼
  const domainDict = [
    '脉冲电场消融', '心房颤动', '肺静脉隔离', '冠心病', '心肌梗死', 'TAVR', '介入手术',
    '高血压', '脑卒中', '电穿孔', '心电图', '房室传导阻滞', '抗凝治疗', '支架植入',
    '靶向治疗', '免疫检查点', '基因测序', '纳米载体', '生理波形', '并发症'
  ];
  const keywords = domainDict.filter(kw => cleanText.includes(kw));

  // 6. 简要概括 (summary)
  let summary = '';
  if (selectedFacts.length > 0) {
    summary = `基于参考资料《${filename}》解析：提炼出 ${selectedFacts.length} 条核心医学与科学证据事实，聚焦于${suggestedTopic}的临床应用、核心机制与关键数据指标。`;
  } else {
    summary = `已读取参考资料《${filename}》，全文共 ${cleanText.length} 字。`;
  }

  return {
    filename,
    textLength: cleanText.length,
    suggestedTopic,
    suggestedAudience,
    suggestedTemplate,
    facts: selectedFacts,
    summary,
    keywords: keywords.slice(0, 6)
  };
}

module.exports = {
  extractRawText,
  analyzeDocumentText
};
