const config = {
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
