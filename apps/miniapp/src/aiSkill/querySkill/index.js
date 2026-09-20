const searchProducts = require('./apis/searchProducts')
const searchCustomers = require('./apis/searchCustomers')
const queryOrders = require('./apis/queryOrders')

const skill = wx.modelContext.createSkill('aiSkill/querySkill')

skill.registerAPI('searchProducts', searchProducts)
skill.registerAPI('searchCustomers', searchCustomers)
skill.registerAPI('queryOrders', queryOrders)
