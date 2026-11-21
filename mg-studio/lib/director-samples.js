'use strict';

const graphic = (asset, x, y, w, h, action = 'draw', at = 0.06, span = .42, color = 'accent') =>
  ({ kind: 'icon', asset, x, y, w, h, action, at, span, color });
const text = (content, x, y, w, h, size, action = 'reveal', at = .08, align = 'left', color = 'ink') =>
  ({ kind: 'text', content, x, y, w, h, size, action, at, span: .23, align, color });
const shape = (kind, x, y, w, h, action = 'draw', at = .10, color = 'accent') =>
  ({ kind, x, y, w, h, action, at, span: .53, color });
const rainDrop = (w, h, points) => ({
  ...graphic('droplet', points[0][1], points[0][2], w, h, 'hold', 0, .45, 'accent2'),
  object: 'rain_drop', track: points.map(([t, x, y, scale]) => ({ t, x, y, ...(scale ? { scale } : {}) }))
});
const camera = points => points.map(([t, x, y, zoom]) => ({ t, x, y, zoom }));
const levels = points => points.map(([t, value]) => ({ t, value }));
const roofNarration = '这滴雨碰到斜屋顶，贴着瓦片一路滑，最后从屋檐落下。';
const roadNarration = '雨滴沿着硬路面流。看，路边带格栅的口，就是雨水口。';

const samples = {
  rain_scene: {
    label: '雨滴街道剖面（13 秒动效试片）',
    brief: '画出屋面、落水管、街道与地下管道的同一剖面，让观众跟着水流从屋檐走到雨水口。',
    title: '跟着雨水走', style: 'warm-editorial', audience: 'general',
    sharedStages: { street: { art: 'rain-catchment', route: [
      [590, 126], [615, 290, 611, 179], [877, 423, 717, 340], [928, 429], [937, 446, 938, 429],
      [937, 683], [957, 707, 937, 704], [1006, 719], [1036, 748, 1027, 724],
      [1372, 785, 1217, 765], [1392, 824, 1392, 787], [1392, 892],
      [1464, 946, 1394, 943], [1720, 946]
    ] } },
    shots: [
      { title: '水沿着屋檐落下', narration: roofNarration, seconds: 202 / 30, transition: 'cut', layers: [
        text('跟着雨水走', 5, 7, 40, 11, 71, 'reveal', .02)
      ], stage: { id: 'street',
        camera: camera([[0, 675, 395, 1.49], [.38, 712, 416, 1.43], [.78, 869, 507, 1.31], [1, 984, 574, 1.16]]),
        flow: levels([[0, .015], [.26, .106], [.57, .273], [.71, .305], [1, .524]]),
        reveal: levels([[0, 0], [1, 0]]),
        labels: [{ text: '斜屋面', x: 714, y: 303, from: .30, to: .57 },
          { text: '落水管', x: 961, y: 481, from: .65, to: .95 }]
      }},
      { title: '水流钻进雨水口', narration: roadNarration, seconds: 202 / 30, transition: 'match', layers: [],
        stage: { id: 'street',
        camera: camera([[0, 984, 574, 1.16], [.53, 1258, 667, 1.41], [.74, 1278, 664, 1.40], [1, 1189, 614, 1.21]]),
        flow: levels([[0, .524], [.24, .594], [.60, .719], [.75, .754], [.85, .841], [1, 1]]),
        reveal: levels([[0, 0], [.64, 0], [.86, 1], [1, 1]]),
        labels: [{ text: '沿坡汇流', x: 1120, y: 673, from: .19, to: .57 },
          { text: '雨水口', x: 1405, y: 728, from: .48, to: .88 },
          { text: '雨水管道', x: 1578, y: 892, from: .83, to: 1 }]
      }}
    ]
  },
  journey: {
    label: '追踪一滴雨（跨镜样片）',
    brief: '做一条城市科普 MG，跟着同一滴雨，从雨云到屋顶、路面，再看雨水口与绿地的两条路径。',
    title: '追踪一滴雨', style: 'deep-tech', audience: 'general',
    arc: { question: '积水消失后，雨去了哪里？', visualMotif: '一滴蓝色的雨', beats: ['跟到屋顶', '顺坡到路边', '看雨水口', '比较绿地'], payoff: '从地面材料和排水口找线索' },
    shots: [
      { title: '积水消失之后', narration: '昨天的积水没了。它去了哪里？我们从一滴雨落下看起。', seconds: 7, transition: 'cut', layers: [
        graphic('rain-roof', 53, 28, 39, 51, 'reveal', .16, .56, 'muted'),
        text('积水消失之后', 8, 15, 54, 16, 111), text('雨去哪了？', 8, 40, 37, 12, 74, 'slide', .29),
        rainDrop(8, 15, [[0, 73, 8], [.36, 72, 15], [.68, 67, 25], [1, 62, 38]])
      ]},
      { title: '沿屋顶往下', narration: roofNarration, seconds: 7, transition: 'match', layers: [
        graphic('rain-roof', 16, 14, 68, 64, 'slide', .08, .52, 'accent'),
        shape('line', 32, 73, 42, 1.2, 'draw', .38, 'accent2'),
        text('顺着屋檐落下', 8, 8, 54, 12, 84, 'slide', .14),
        rainDrop(9, 16, [[0, 60, 25], [.25, 45, 36], [.69, 65, 51], [1, 69, 65]])
      ]},
      { title: '沿路追到雨水口', narration: roadNarration, seconds: 7, transition: 'match', layers: [
        graphic('rain-street', 8, 27, 84, 53, 'reveal', .08, .62, 'accent'),
        text('找一找路边的格栅', 9, 11, 65, 15, 85, 'reveal', .12),
        rainDrop(7, 13, [[0, 29, 35], [.28, 29, 48], [.65, 57, 51], [1, 74, 55]])
      ]},
      { title: '格栅下面', narration: '穿过格栅，雨水钻进排水管。地面上的积水也随之变少。', seconds: 6.2, transition: 'match', layers: [
        shape('panel', 49, 13, 42, 60, 'grow', .12, 'muted'),
        graphic('rain-street', 42, 21, 45, 49, 'reveal', .15, .48),
        text('沿管道离开路面', 8, 19, 39, 28, 79, 'slide', .15),
        rainDrop(7, 13, [[0, 74, 29], [.36, 73, 45], [.68, 65, 55], [1, 54, 58]])
      ]},
      { title: '换一个落点', narration: '把镜头倒回去。如果落在草地，雨水还可以沿土壤的空隙往下渗。', seconds: 7.3, transition: 'wipe', layers: [
        graphic('rain-soil', 41, 25, 51, 53, 'reveal', .02, .55, 'accent'),
        text('如果落在草地？', 8, 10, 68, 15, 87), text('看水向下渗', 8, 48, 35, 14, 67, 'slide', .50),
        rainDrop(7, 13, [[0, 65, 27], [.42, 65, 41], [.74, 64, 55], [1, 63, 67, .7]])
      ]},
      { title: '带着两个线索回街上', narration: '下次下雨，看看脚下是路面还是草地，再找找雨水口。你也能追踪一滴雨。', seconds: 7.5, transition: 'match', layers: [
        graphic('rain-street', 8, 31, 36, 44, 'reveal', .16, .47, 'accent'),
        graphic('rain-soil', 57, 31, 35, 44, 'reveal', .36, .47, 'accent'),
        text('看地面，找排水口', 8, 8, 84, 15, 91, 'reveal', .12, 'center'),
        rainDrop(7, 13, [[0, 42, 55], [.42, 47, 30], [1, 47, 26]])
      ]}
    ]
  },
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

const streetWorld = {
  ...samples.rain_scene.sharedStages.street,
  routes: { garden: [
    [1674, 355], [1765, 751, 1809, 545], [1765, 813, 1760, 775],
    [1782, 883, 1790, 846], [1752, 940, 1765, 917], [1784, 1019, 1744, 978]
  ] }
};
const street = (view, flow, reveal, labels = [], extra = {}) => ({
  id: 'street', camera: camera(view), flow: levels(flow), reveal: levels(reveal), labels, ...extra
});
const label = (text, x, y, from, to) => ({ text, x, y, from, to });
const off = [[0, 0], [1, 0]];
const roof = samples.rain_scene.shots[0].stage;
const road = samples.rain_scene.shots[1].stage;
const rainStory = {
  ...samples.journey, label: '追踪一滴雨（连续剖面完整版）', style: 'warm-editorial',
  sharedStages: { street: streetWorld },
  shots: [
    { layers: [text('积水去哪了？', 29, 6, 45, 11, 71, 'reveal', .05)], stage: street(
      [[0, 1230, 651, 1.42], [.46, 1240, 636, 1.37], [1, 675, 395, 1.49]],
      [[0, .015], [1, .015]], off, [label('昨天的积水', 1120, 704, .14, .52)],
      { puddle: levels([[0, 1], [.31, 1], [.60, 0], [1, 0]]), water: levels([[0, 0], [.68, 0], [.94, 1], [1, 1]]) }) },
    { layers: [], stage: roof },
    { layers: [], stage: { ...road,
      camera: camera([[0, 984, 574, 1.16], [.60, 1230, 660, 1.40], [1, 1278, 664, 1.40]]),
      flow: levels([[0, .524], [.28, .603], [.66, .723], [1, .754]]),
      reveal: levels(off), labels: [label('沿坡汇流', 1120, 673, .19, .62),
        label('雨水口', 1404, 728, .58, 1)] } },
    { layers: [], stage: street(
      [[0, 1278, 664, 1.40], [.53, 1350, 681, 1.43], [1, 1321, 643, 1.26]],
      [[0, .754], [.27, .775], [.58, .9], [1, 1]], [[0, 0], [.45, 1], [1, 1]],
      [label('雨水口', 1404, 728, 0, .34), label('雨水管道', 1540, 872, .37, .98)]) },
    { layers: [], stage: street(
      [[0, 1321, 643, 1.26], [.25, 1520, 576, 1.34], [.65, 1510, 650, 1.37], [1, 1320, 614, 1.15]],
      [[0, 0], [.22, .04], [.49, .54], [.73, .77], [1, 1]], [[0, 1], [.28, 0], [1, 0]],
      [label('落到草地', 1596, 658, .29, .66), label('渗入土壤', 1671, 854, .65, .99)],
      { route: 'garden', soil: levels([[0, 0], [.36, 0], [.66, 1], [1, 1]]),
        water: levels([[0, 0], [.13, 0], [.25, 1], [1, 1]]) }) },
    { layers: [text('一滴雨，两条路', 5, 7, 45, 11, 69, 'reveal', .08)], stage: street(
      [[0, 1320, 614, 1.15], [.55, 1190, 574, 1.09], [1, 960, 540, 1]],
      off, [[0, .15], [.25, 1], [1, 1]],
      [label('路面径流', 1145, 690, .26, .92), label('草地下渗', 1640, 700, .39, .92)],
      { compare: true, soil: levels([[0, 1], [1, 1]]) }) }
  ].map((shot, i) => ({ ...samples.journey.shots[i], ...shot, seconds: [195, 202, 202, 197, 217, 247][i] / 30 }))
};

module.exports = { samples: { rain_story: rainStory, ...samples }, graphic, text, shape };
