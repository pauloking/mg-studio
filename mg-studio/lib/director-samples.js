'use strict';

const graphic = (asset, x, y, w, h, action = 'draw', at = 0.06, span = .42, color = 'accent') =>
  ({ kind: 'icon', asset, x, y, w, h, action, at, span, color });
const text = (content, x, y, w, h, size, action = 'reveal', at = .08, align = 'left', color = 'ink') =>
  ({ kind: 'text', content, x, y, w, h, size, action, at, span: .23, align, color });
const shape = (kind, x, y, w, h, action = 'draw', at = .10, color = 'accent') =>
  ({ kind, x, y, w, h, action, at, span: .53, color });

const samples = {
  rain: {
    label: '雨水去哪了',
    brief: '给孩子做一条简短的城市科普动画，用一滴雨做主角，解释城市雨水的去向。',
    title: '一滴雨的两条路', style: 'deep-tech', audience: 'general',
    shots: [
      { title: '跟上一滴雨', narration: '雨停了。你刚刚踩过的那片积水，会去哪里？', seconds: 4, transition: 'cut', layers: [
        shape('ring', 62, 12, 25, 45, 'grow'), graphic('droplet', 67, 20, 15, 28, 'slide', .02),
        text('积水去哪了？', 8, 24, 51, 19, 126), text('跟上一滴雨', 9, 49, 44, 12, 58, 'slide', .32)
      ]},
      { title: '道路上的分岔', narration: '跟上这滴雨。它落到硬路面，顺着坡度流向排水口。', seconds: 5, transition: 'wipe', layers: [
        graphic('house', 9, 17, 18, 32, 'draw'), shape('line', 18, 64, 58, 1.2),
        graphic('droplet', 32, 45, 7, 13, 'drift', .22, .55, 'accent2'),
        graphic('waves', 74, 43, 14, 24, 'draw', .45), text('顺着坡走', 33, 16, 40, 15, 92, 'slide')
      ]},
      { title: '绿地的另一条路', narration: '如果它落在绿地，一部分雨水会渗入土里。', seconds: 4.8, transition: 'push', layers: [
        shape('panel', 57, 36, 32, 41, 'grow', .06, 'accent2'),
        graphic('sprout', 64, 17, 18, 37, 'draw', .14, .43, 'accent2'),
        graphic('droplet', 70, 52, 6, 12, 'slide', .45), text('走进泥土', 8, 31, 47, 16, 109)
      ]},
      { title: '回到开头的问题', narration: '下次下雨，看看路边哪里会积水，哪里更容易渗水。', seconds: 4.7, transition: 'cut', layers: [
        graphic('route', 41, 12, 18, 33, 'draw'), graphic('waves', 15, 48, 14, 24, 'slide', .25),
        graphic('sprout', 70, 48, 14, 24, 'grow', .40, .28, 'accent2'),
        text('一滴雨，两条路', 24, 45, 52, 13, 90, 'reveal', .16, 'center')
      ]}
    ]
  },
  product: {
    label: '便携灯演示',
    brief: '给一盏便携夹灯做一条产品短片。夹在书边，灯头可转向。不写虚构参数。',
    title: '给书页一束光', style: 'warm-editorial', audience: 'general',
    shots: [
      { title: '从书页开始', narration: '夜里想再读几页，先给书页留一束光。', seconds: 4, transition: 'fade', layers: [
        graphic('book-open', 11, 17, 31, 52, 'draw'), shape('ring', 61, 10, 25, 45, 'grow', .32, 'accent2'),
        graphic('lightbulb', 67, 19, 13, 27, 'punch', .26), text('再读几页', 51, 58, 38, 16, 102, 'reveal')
      ]},
      { title: '夹住书边', narration: '把灯夹到书边，翻页时手边依然有空间。', seconds: 4.5, transition: 'push', layers: [
        shape('panel', 8, 14, 44, 58, 'hold'), graphic('book-open', 15, 22, 30, 43, 'slide'),
        graphic('lightbulb', 39, 12, 12, 20, 'punch', .36, .22, 'accent2'), text('夹在书边', 57, 30, 35, 17, 95, 'reveal', .22)
      ]},
      { title: '把光转向文字', narration: '转一下灯头，把光对准正在读的那一行。', seconds: 4.8, transition: 'wipe', layers: [
        graphic('lightbulb', 14, 24, 20, 34, 'turn'), shape('line', 33, 51, 38, 1.1, 'draw', .31),
        graphic('book-open', 71, 39, 15, 28, 'grow', .36, .31, 'accent2'),
        text('让光对准文字', 40, 14, 49, 16, 93, 'slide')
      ]},
      { title: '回到阅读', narration: '留一页给自己，今晚读到这里。', seconds: 3.8, transition: 'cut', layers: [
        graphic('lightbulb', 43, 9, 14, 31, 'draw'), shape('line', 35, 63, 30, 1, 'draw', .3),
        text('留一页给自己', 18, 44, 64, 15, 110, 'reveal', .19, 'center')
      ]}
    ]
  },
  medical: {
    label: '消融试验图解',
    brief: '用同屏对照讲清 ADVENT 试验比较的两种房颤消融方法，只讲研究设计。',
    title: '这项试验比较了什么？', style: 'clean-medical', audience: 'patient',
    facts: [{
      claim: 'ADVENT 试验在阵发性房颤患者中比较脉冲电场消融与传统热消融。', verified: true,
      citation: { title: 'Pulsed Field or Conventional Thermal Ablation for Paroxysmal Atrial Fibrillation',
        url: 'https://pubmed.ncbi.nlm.nih.gov/37634148/', id: 'pmid_37634148' }
    }],
    shots: [
      { title: '从研究问题开场', narration: '同一项房颤试验，为什么要放两种消融方法在一起比较？', seconds: 5.2, transition: 'cut', layers: [
        graphic('heart-pulse', 64, 15, 23, 48, 'draw'), shape('line', 8, 64, 46, 1.2),
        text('两种消融方法', 8, 22, 53, 17, 112), text('试验怎么比？', 8, 44, 51, 15, 80, 'slide', .30)
      ]},
      { title: '两种方法同屏', narration: 'ADVENT 试验对照了脉冲电场消融和传统热消融。', evidence: [1], seconds: 5.2, transition: 'wipe', layers: [
        shape('panel', 7, 16, 40, 62, 'grow'), shape('panel', 53, 16, 40, 62, 'grow', .27, 'accent2'),
        graphic('zap', 19, 22, 16, 30, 'draw'), graphic('activity', 65, 22, 16, 30, 'draw', .28, .37, 'accent2'),
        text('脉冲电场消融', 10, 61, 34, 11, 75, 'reveal', .19, 'center'),
        text('传统热消融', 56, 61, 34, 11, 75, 'reveal', .45, 'center')
      ]},
      { title: '把两种方法放回试验', narration: '研究对象是阵发性房颤患者。', evidence: [1], seconds: 4.2, transition: 'push', layers: [
        graphic('heart-pulse', 11, 21, 22, 41, 'draw'), shape('line', 33, 44, 16, 1),
        graphic('flask-conical', 50, 19, 15, 29, 'draw', .23), text('阵发性房颤', 45, 52, 44, 13, 86, 'slide', .39)
      ]},
      { title: '回到原始研究', narration: '先看清试验比较了谁和谁，再翻原论文看结果。', seconds: 4.3, transition: 'cut', layers: [
        graphic('book-open', 41, 13, 16, 30, 'draw'), text('从比较对象读起', 13, 46, 74, 16, 95, 'reveal', .18, 'center')
      ]}
    ]
  }
};

module.exports = { samples, graphic, text, shape };
