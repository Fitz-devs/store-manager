const recognizePurchaseSlip = require('./apis/recognizePurchaseSlip')
const matchPurchaseItems = require('./apis/matchPurchaseItems')
const submitPurchase = require('./apis/submitPurchase')
const patchPurchaseImages = require('./apis/patchPurchaseImages')
const queryPurchases = require('./apis/queryPurchases')

const skill = wx.modelContext.createSkill('aiSkill/purchaseSkill')

skill.registerAPI('recognizePurchaseSlip', recognizePurchaseSlip)
skill.registerAPI('matchPurchaseItems', matchPurchaseItems)
skill.registerAPI('submitPurchase', submitPurchase)
skill.registerAPI('patchPurchaseImages', patchPurchaseImages)
skill.registerAPI('queryPurchases', queryPurchases)
