var Promise = require('bluebird')
var AWS = require('aws-sdk')
var DynamoDB = Promise.promisifyAll(new AWS.DynamoDB())
var _ = require('lodash')
var qs = require('qs')
var post = Promise.promisify(require('request').post)
var get = Promise.promisify(require('request').get)
var crypto = require('crypto')

/// //////////
//  UTILS
/// //////////

const CURRENCIES = {
  BTC: { name: 'Bitcoin', color: 'FF7300' },
  ETH: { name: 'Ethereum', color: '8C01FF' },
  BCH: { name: 'Bitcoin Cash', color: 'FF7300' },
  LTC: { name: 'Litecoin', color: 'B4B4B4' },
  REP: { name: 'Augur', color: 'EC3766' },
  ZEC: { name: 'ZCash', color: 'F0AD4E' },
  LSK: { name: 'Lisk', color: '38E6B2' },
  XMR: { name: 'Monero', color: 'CF4900' },
  ETC: { name: 'Ethereum Classic', color: '4FB858' },
  XRP: { name: 'Ripple', color: '27A2DB' },
  DASH: { name: 'Dash', color: '1E73BE' },
  STR: { name: 'Stellar', color: '08B5E5' },
  MAID: { name: 'MaidSafeCoin', color: '5592D7' },
  FCT: { name: 'Factom', color: '417BA4' },
  XEM: { name: 'NEM', color: 'FABE00' },
  STEEM: { name: 'Steem', color: '4BA2F2' },
  DOGE: { name: 'Dogecoin', color: 'F2A51F' },
  SDC: { name: 'ShadowCash', color: 'E2213D' },
  BTS: { name: 'BitShares', color: '00A9E0' },
  GAME: { name: 'GameCredits', color: '7CBF3F' },
  ARDR: { name: 'Ardor', color: '1162A1' },
  DCR: { name: 'Decred', color: '47ACD7' },
  SJCX: { name: 'Storjcoin X', color: '0014FF' },
  SC: { name: 'Siacoin', color: '009688' },
  IOC: { name: 'I/O Coin', color: '84D0F4' },
  GNT: { name: 'Golem', color: '01d3e0' },
  OMG: { name: 'OmiseGO', color: '99ccff' }
}

exports.sha256 = (val) => {
  return crypto.createHash('sha256').update(val).digest().toString('hex')
}

exports.twodp = (val) => {
  return Math.floor(val * 100) / 100
}

exports.force_twodp = (val) => {
  return exports.twodp(val).toFixed(2)
}

exports.convertRange = (value, r1, r2) => {
  return (value - r1[ 0 ]) * (r2[ 1 ] - r2[ 0 ]) / (r1[ 1 ] - r1[ 0 ]) + r2[ 0 ]
}

exports.format_percent_diff = (num) => {
  num = num * 100
  var prefix = "+"
  if (num < 0) {
    prefix = "-"
  }

  return `${prefix}${exports.twodp(Math.abs(num))}%`
}

exports.format_currency = (num) => {
  return `$${exports.force_twodp(Math.abs(num))}`
}

exports.format_currency_diff = (num) => {
  var prefix = "+"
  if (num < 0) {
    prefix = "-"
  }

  return `${prefix}${exports.format_currency(num)}`
}

/// //////////
//  DynamoDB Wrapper
/// //////////

exports.putItemAsync = (item) => {
  return DynamoDB.putItemAsync(item)
}

exports.getItemAsync = (query) => {
  return DynamoDB.getItemAsync(query)
}

/// //////////
//  ADD
/// //////////

exports.save_user_data_to_db = (user_data) => {
  return exports.putItemAsync({
    TableName: 'lionshare-slack',
    Item: {
      team_user_sha: {
        S: user_data.team_user_sha
      },
      data: {
        S: JSON.stringify(user_data.data)
      }
    }
  })
}

exports.update_user_data = (ls_event, user_data) => {
  user_data.data[ls_event.currency] = ls_event.amount

  return exports.save_user_data_to_db(user_data).then(() => {
    return user_data
  })
}

/// //////////
//  GET
/// //////////

// CURRENCY DATA

// https://api.lionshare.capital/api/prices
// { "data": "BTC": [1,2,3,4,5], ...}

exports.fetch_currency_data = () => {
  // TODO: add a simple in memory cache
  return get('https://api.lionshare.capital/api/prices').then((cd) => {
    return JSON.parse(cd.body).data
  })
}

// USER DATA
exports.item_to_user_data = (ls_event, item) => {
  if (!item) {
    return {
      team_user_sha: ls_event.team_user_sha,
      data: {}
    }
  }
  return {
    team_user_sha: ls_event.team_user_sha,
    data: JSON.parse(item.data.S) // {<currency>: <amount>}]
  }
}

exports.fetch_user_data = (ls_event) => {
  var query = {
    Key: {
      'team_user_sha': {
        S: ls_event.team_user_sha
      }
    },
    TableName: 'lionshare-slack'
  }

  return exports.getItemAsync(query).then((data) => {
    return exports.item_to_user_data(ls_event, data.Item)
  })
}

/// //////////
//  VALIDATIONS
/// //////////

exports.validate_str = (obj, name) => {
  if (!_.isString(obj[name])) {
    throw new Error(`${name} not String (${obj[name]})`)
  }
}

exports.validate_num = (obj, name) => {
  if (!_.isNumber(obj[name])) {
    throw new Error(`${name} not Number (${obj[name]})"`)
  }
}
// must be valid slack token
exports.validate = (ls_event, user_data, currency_data) => {
  // Security
  if (process.env.SLACK_TOKEN !== ls_event.token) {
    throw new Error('Unauthorized Access')
  }

  var currencies = Object.keys(currency_data)

  // if currency, it should be in list
  if (!_.isEmpty(ls_event.currency) && !_.includes(currencies, ls_event.currency)) {
    throw new Error(`Unsupported Currency ${ls_event.currency}. Please select from ${currencies.join(',')}`)
  }

  exports.validate_num(ls_event, 'amount')
  exports.validate_str(ls_event, 'team_user_sha')

  return true
}

/// //////////
//  Message Logic
/// //////////

// https://developers.google.com/chart/image/docs/chart_playground
exports.build_currency_chart = (currency, currency_data) => {
  var color = CURRENCIES[currency].color
  // line chart url
  var url = 'http://chart.googleapis.com/chart?cht=lc:nda'
  // Size and background color
  url += '&chs=150x50&chf=bg,s,EEEEEE'
  // line color and thickness
  url += `&chco=${color}&chls=6,10,0`

  var min = _.min(currency_data)
  var max = _.max(currency_data)

  // data must be scaled between 0 and 100
  var data = currency_data.map((d) => { return exports.convertRange(d, [ min, max ], [ 0, 100 ]) })

  url += `&chd=t:${data.join(',')}`

  return url
}

// http://bit.ly/2jZr1V2
exports.build_currency_attachment = (currency, amount, currency_data) => {
  var color = CURRENCIES[currency].color
  // var name = CURRENCIES[currency].name
  var first = _.first(currency_data)
  var last = _.last(currency_data)

  var percent = (last - first) / last

  var amount_str = ''

  if (amount > 0) {
    var total_amount = last * amount
    amount_str = `${amount} ${currency} = ${exports.format_currency(total_amount)} (${exports.format_currency_diff(percent * total_amount)})`
  }

  return {
    color: color,
    title: `${currency} ${exports.format_currency(last)} (${exports.format_percent_diff(percent)})`,
    text: amount_str,
    image_url: exports.build_currency_chart(currency, currency_data)
  }
}


exports.build_slack_message_attachements = (config, currency_data) => {
  // config: {currency: amount}
  var attachments = []
  _.forEach(config, (amount, currency) => {
    attachments.push(exports.build_currency_attachment(currency, amount, currency_data[currency]))
  })

  return attachments
}

exports.build_slack_message = (ls_event, user_data, currency_data) => {
  // IF we ADD
  //  Return the USER data CONFIG
  // else
  //   IF CURRENCY we view just the currency default amount to user DATA
  //   else
  //    if USER_DATA only view the user_data
  //    else view a few currencies

  var config = {}
  var message = {
    username: 'Lionshare'
  }

  if (ls_event.action === 'ADD') {
    message.attachments = exports.build_slack_message_attachements(user_data.data, currency_data)
    return message
  }

  // IT IS A GET

  if (ls_event.currency) {
    config[ls_event.currency] = user_data[ls_event.currency] || ls_event.amount
    message.attachments = exports.build_slack_message_attachements(config, currency_data)
    return message
  }

  if (!_.isEmpty(user_data.data)) {
    message.attachments = exports.build_slack_message_attachements(user_data.data, currency_data)
    return message
  }

  if (!_.isEmpty(user_data.data)) {
    message.attachments = exports.build_slack_message_attachements(user_data.data, currency_data)
    return message
  }

  // DEFAULT currencies
  config = {
    'BTC': -1,
    'ETH': -1,
    'LTC': -1
  }

  message.attachments = exports.build_slack_message_attachements(config, currency_data)
  return message
}

/// //////////
//  HANDLE
/// //////////
exports.build_ls_event = (event) => {
  var raw_ls = {}

  if (event.httpMethod === 'POST') {
    raw_ls = qs.parse(event.body)
  } else {
    raw_ls = event.queryStringParameters
  }

  var args = _.trim(raw_ls.text).split(' ')
  var action = 'GET'   // ADD or GET

  if (_.upperCase(args[0]) === 'ADD') {
    action = 'ADD'
    args = [args[1], args[2]] // Move currency and amount to the left
  }

  var team_user_sha = exports.sha256(`${process.env.SALT}::${raw_ls.team_id}::${raw_ls.user_id}`)

  return {
    action: action,
    team_user_sha: team_user_sha,
    currency: _.upperCase(args[0]),
    amount: parseFloat(args[1] || -1),
    team_id: raw_ls.team_id,
    user_id: raw_ls.user_id,
    token: raw_ls.token
  }
}

// POST REQUEST
// {
//   "resource": "", path": "", "headers": {}, "requestContext": {}, "isBase64Encoded": false
//   "httpMethod": "POST",
//   "body": "token=<TOKEN>&team_id=<TEAMID>&team_domain=<TEAMDOMAIN>&user_id=<ID>&user_name=<>&command=%2Fls&text=<>",
//   "queryStringParameters": null
// }
exports.handle_ls = (event, callback) => {
  return Promise.try(() => {
    var ls_event = exports.build_ls_event(event)
    return Promise.all([
      ls_event,
      exports.fetch_user_data(ls_event),
      exports.fetch_currency_data()
    ])
  }).spread((ls_event, user_data, currency_data) => {
    console.log(JSON.stringify(ls_event, null, 2))
    console.log(JSON.stringify(user_data, null, 2))
    console.log(JSON.stringify(currency_data, null, 2))

    exports.validate(ls_event, user_data, currency_data)

    if (ls_event.action === 'GET') {
      return exports.build_slack_message(ls_event, user_data, currency_data)
    } else {
      return exports.update_user_data(ls_event, user_data).then((new_user_data) => {
        return exports.build_slack_message(ls_event, new_user_data, currency_data)
      })
    }
  }).then((response_text) => {
    console.log(JSON.stringify(response_text, null, 2))

    var response = {
      statusCode: 200,
      headers: {},
      body: JSON.stringify(response_text)
    }

    callback(null, response)
  }).catch((e) => {
    console.log("CAUGHT  ERROR")
    console.log(e)

    // Catch The error and return to Slack
    var response = {
      statusCode: 200,
      headers: {},
      body: JSON.stringify({
        username: 'Lionshare',
        text: e.message
      })
    }
    callback(null, response)
  })
}

exports.handle = (event, context, callback) => {
  if (event.path === '/ls') {
    return exports.handle_ls(event, callback)
  } else if (event.path === '/oauth') {
    return exports.handle_oauth(event, callback)
  } else {
    return callback(new Error(`Unknown path "${event.path}"`), null)
  }
}

/// //////////
//  HANDLE OAUTH
/// //////////

// adapted from https://github.com/girliemac/slack-httpstatuscats/blob/master/index.js
exports.authenticate = (code) => {
  return post('https://slack.com/api/oauth.access', {
    form: {
      client_id: process.env.SLACK_CLIENT_ID,
      client_secret: process.env.SLACK_CLIENT_SECRET,
      code: code
    }
  })
}
// GET REQUEST
// {
//   "resource": "", path": "", "headers": {}, "requestContext": {}, "isBase64Encoded": false
//   "httpMethod": "GET",
//    "queryStringParameters": {
//      "code": "<code>",
//      "state": ""
//    },
//   "body": null
// }
exports.handle_oauth = (event, callback) => {
  var code = event.queryStringParameters.code

  if (!code) {
    return callback(null, {
      statusCode: 403,
      body: 'OAuth requires code param'
    })
  }

  return Promise.try(() => {
    return exports.authenticate(code)
  }).then((resp) => {
    var response = {
      statusCode: 302,
      headers: {
        Location: 'https://github.com/lionsharecapital'
      }
    }
    return callback(null, response)
  }).catch((e) => {
    console.log(e)
    // Catch The error and return 400
    var response = {
      statusCode: 400,
      headers: {},
      body: e.message
    }
    callback(null, response)
  })
}
