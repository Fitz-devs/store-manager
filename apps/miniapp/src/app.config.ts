const config = {
  lazyCodeLoading: 'requiredComponents',
  subPackages: [
    {
      root: 'aiSkill',
      independent: true,
      pages: [],
    },
  ],
  agent: {
    skills: [
      {
        name: 'querySkill',
        description: '查询店内商品价格、客户与订单信息',
        path: 'aiSkill/querySkill',
      },
      {
        name: 'orderSkill',
        description: '对话开单：匹配店内商品与客户，对话确认后直接提交订单',
        path: 'aiSkill/orderSkill',
      },
      {
        name: 'purchaseSkill',
        description: '入库单据处理：识别/匹配收货单明细，对话确认后直接提交入库单',
        path: 'aiSkill/purchaseSkill',
      },
      {
        name: 'productSkill',
        description: '商品档案管理：建档、加规格、改价、缺货标记、下架（变更前需用户确认）',
        path: 'aiSkill/productSkill',
      },
    ],
    instruction: 'aiSkill/AGENTS.md',
  },
  pages: [
    'pages/products/index',
    'pages/product-list/index',
    'pages/order-new/index',
    'pages/orders/index',
    'pages/purchases/index',
    'pages/me/index',
    'pages/login/index',
    'pages/product-detail/index',
    'pages/product-edit/index',
    'pages/purchase-new/index',
    'pages/purchase-detail/index',
    'pages/customer-detail/index',
    'pages/customer-select/index',
    'pages/customer-edit/index',
    'pages/customers/index',
    'pages/categories/index',
    'pages/order-detail/index',
    'pages/users/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#2563eb',
    navigationBarTitleText: '店铺管家',
    navigationBarTextStyle: 'white',
  },
  tabBar: {
    color: '#6b7280',
    selectedColor: '#2563eb',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/products/index',
        text: '首页',
        iconPath: 'assets/tabbar/product.png',
        selectedIconPath: 'assets/tabbar/product-active.png',
      },
      {
        pagePath: 'pages/order-new/index',
        text: '开单',
        iconPath: 'assets/tabbar/order.png',
        selectedIconPath: 'assets/tabbar/order-active.png',
      },
      {
        pagePath: 'pages/orders/index',
        text: '订单',
        iconPath: 'assets/tabbar/orders.png',
        selectedIconPath: 'assets/tabbar/orders-active.png',
      },
      {
        pagePath: 'pages/purchases/index',
        text: '入库',
        iconPath: 'assets/tabbar/purchase.png',
        selectedIconPath: 'assets/tabbar/purchase-active.png',
      },
      {
        pagePath: 'pages/me/index',
        text: '我的',
        iconPath: 'assets/tabbar/me.png',
        selectedIconPath: 'assets/tabbar/me-active.png',
      },
    ],
  },
  permission: {
    'scope.userLocation': {
      desc: '送货拍照水印与地图选点/导航需要位置信息',
    },
  },
  requiredPrivateInfos: ['getLocation', 'chooseLocation'],
}

export default defineAppConfig(config as unknown as Parameters<typeof defineAppConfig>[0])
