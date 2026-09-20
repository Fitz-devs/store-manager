const matchProducts = require('./apis/matchProducts')
const matchCustomers = require('./apis/matchCustomers')
const submitOrder = require('./apis/submitOrder')
const patchOrderDeliveryPhoto = require('./apis/patchOrderDeliveryPhoto')

const skill = wx.modelContext.createSkill('aiSkill/orderSkill')

skill.registerAPI('matchProducts', matchProducts)
skill.registerAPI('matchCustomers', matchCustomers)
skill.registerAPI('submitOrder', submitOrder)
skill.registerAPI('patchOrderDeliveryPhoto', patchOrderDeliveryPhoto)
