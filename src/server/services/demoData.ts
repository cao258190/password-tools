export const demoUser = {
  email: "demo@example.com",
  name: "U",
  password: "demo123456"
};

export const demoSites = [
  {
    name: "Google",
    category: "工具",
    primaryUrl: "https://www.google.com",
    backupUrls: ["https://accounts.google.com", "https://myaccount.google.com"],
    iconType: "google",
    iconValue: "G",
    iconBg: "#ffffff",
    iconColor: "#111827",
    favorite: false,
    tags: ["搜索引擎", "重要", "工作"],
    note: "Google 账户用于登录 Google 各项服务（Gmail、Drive、YouTube 等）。\n建议开启两步验证以增强账户安全。",
    accounts: [
      {
        label: "主账号",
        username: "user.primary@gmail.com",
        password: "G00gle!Primary#2026",
        strength: "strong",
        favorite: false
      },
      {
        label: "工作账号",
        username: "user.work@company.com",
        password: "Work-Google-2026!",
        strength: "medium",
        favorite: false
      },
      {
        label: "家庭账号",
        username: "user.family@gmail.com",
        password: "family2026",
        strength: "weak",
        favorite: false
      }
    ]
  },
  {
    name: "Microsoft",
    category: "工作",
    primaryUrl: "https://login.live.com",
    backupUrls: ["https://account.microsoft.com"],
    iconType: "microsoft",
    iconValue: "M",
    iconBg: "#ffffff",
    iconColor: "#111827",
    favorite: false,
    tags: ["办公", "工作"],
    note: "用于 Office、Azure 和 Windows 设备同步。",
    accounts: [
      {
        label: "工作账号",
        username: "user.work@outlook.com",
        password: "Microsoft-2026!",
        strength: "strong",
        favorite: false
      },
      {
        label: "备用账号",
        username: "backup@outlook.com",
        password: "Backup-MS-18",
        strength: "medium",
        favorite: false
      }
    ]
  },
  {
    name: "GitHub",
    category: "工作",
    primaryUrl: "https://github.com",
    backupUrls: ["https://github.com/settings/security"],
    iconType: "github",
    iconValue: "GH",
    iconBg: "#111827",
    iconColor: "#ffffff",
    favorite: false,
    tags: ["代码", "工作"],
    note: "仓库、CI 和访问令牌统一记录在这里。",
    accounts: [
      {
        label: "个人账号",
        username: "octo-user",
        password: "Gh!2026-TokenSafe",
        strength: "strong",
        favorite: false
      },
      {
        label: "组织账号",
        username: "company-bot",
        password: "CompanyBot#2026",
        strength: "strong",
        favorite: false
      }
    ]
  },
  {
    name: "支付宝",
    category: "金融理财",
    primaryUrl: "https://www.alipay.com",
    backupUrls: ["https://auth.alipay.com"],
    iconType: "letter",
    iconValue: "支",
    iconBg: "#1677ff",
    iconColor: "#ffffff",
    favorite: false,
    tags: ["支付", "重要"],
    note: "支付账户，保留手机验证和风控提醒。",
    accounts: [
      {
        label: "主账号",
        username: "user@phone",
        password: "AliPay-2026!",
        strength: "strong",
        favorite: false
      },
      {
        label: "备用账号",
        username: "backup@phone",
        password: "AliBackup88",
        strength: "medium",
        favorite: false
      }
    ]
  },
  {
    name: "微信",
    category: "社交媒体",
    primaryUrl: "https://weixin.qq.com",
    backupUrls: [],
    iconType: "letter",
    iconValue: "微",
    iconBg: "#22c55e",
    iconColor: "#ffffff",
    favorite: false,
    tags: ["社交"],
    note: "常用社交账号。",
    accounts: [
      {
        label: "个人账号",
        username: "wechat_user",
        password: "WeChat2026!",
        strength: "medium",
        favorite: false
      }
    ]
  },
  {
    name: "淘宝",
    category: "购物",
    primaryUrl: "https://www.taobao.com",
    backupUrls: [],
    iconType: "letter",
    iconValue: "淘",
    iconBg: "#ff6a00",
    iconColor: "#ffffff",
    favorite: false,
    tags: ["购物"],
    note: "购物与收货地址管理。",
    accounts: [
      {
        label: "主账号",
        username: "taobao_user",
        password: "Taobao-2026!",
        strength: "medium",
        favorite: false
      }
    ]
  },
  {
    name: "YouTube",
    category: "娱乐",
    primaryUrl: "https://www.youtube.com",
    backupUrls: [],
    iconType: "letter",
    iconValue: "▶",
    iconBg: "#ff0000",
    iconColor: "#ffffff",
    favorite: false,
    tags: ["视频", "娱乐"],
    note: "订阅与频道管理。",
    accounts: [
      {
        label: "频道账号",
        username: "creator@gmail.com",
        password: "YT-Creator-2026!",
        strength: "strong",
        favorite: false
      },
      {
        label: "观看账号",
        username: "viewer@gmail.com",
        password: "ViewerYT26",
        strength: "medium",
        favorite: false
      }
    ]
  },
  {
    name: "Twitter",
    category: "社交媒体",
    primaryUrl: "https://x.com",
    backupUrls: ["https://twitter.com"],
    iconType: "letter",
    iconValue: "X",
    iconBg: "#1d9bf0",
    iconColor: "#ffffff",
    favorite: false,
    tags: ["社交", "资讯"],
    note: "公共账号与私信提醒。",
    accounts: [
      {
        label: "主账号",
        username: "@user",
        password: "Twitter-2026!",
        strength: "medium",
        favorite: false
      }
    ]
  },
  {
    name: "Netflix",
    category: "娱乐",
    primaryUrl: "https://www.netflix.com",
    backupUrls: [],
    iconType: "letter",
    iconValue: "N",
    iconBg: "#111827",
    iconColor: "#ffffff",
    favorite: false,
    tags: ["视频", "家庭"],
    note: "家庭共享订阅。",
    accounts: [
      {
        label: "家庭账号",
        username: "family@example.com",
        password: "NetflixFamily26",
        strength: "medium",
        favorite: false
      }
    ]
  },
  {
    name: "Notion",
    category: "工具",
    primaryUrl: "https://www.notion.so",
    backupUrls: [],
    iconType: "letter",
    iconValue: "N",
    iconBg: "#ffffff",
    iconColor: "#111827",
    favorite: false,
    tags: ["笔记", "工具"],
    note: "知识库和项目文档。",
    accounts: [
      {
        label: "主账号",
        username: "notion@example.com",
        password: "Notion-2026!",
        strength: "medium",
        favorite: false
      }
    ]
  },
  {
    name: "Bilibili",
    category: "娱乐",
    primaryUrl: "https://www.bilibili.com",
    backupUrls: [],
    iconType: "letter",
    iconValue: "哔",
    iconBg: "#fb7299",
    iconColor: "#ffffff",
    favorite: false,
    tags: ["视频"],
    note: "视频与直播账号。",
    accounts: [
      {
        label: "主账号",
        username: "bili_user",
        password: "BiliBili2026!",
        strength: "medium",
        favorite: false
      }
    ]
  },
  {
    name: "京东",
    category: "购物",
    primaryUrl: "https://www.jd.com",
    backupUrls: [],
    iconType: "letter",
    iconValue: "京",
    iconBg: "#e1251b",
    iconColor: "#ffffff",
    favorite: false,
    tags: ["购物"],
    note: "购物和发票信息。",
    accounts: [
      {
        label: "主账号",
        username: "jd_user",
        password: "JD-2026-safe",
        strength: "medium",
        favorite: false
      }
    ]
  }
] as const;


