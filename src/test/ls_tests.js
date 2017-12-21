var Lionshare = require('../index.js')
var assert = require('assert');
var _ = require("lodash")
Promise = require("bluebird")

beforeEach(() => {
  process.env.SLACK_TOKEN = 't1'

  // STUBS

  Lionshare.fetch_currency_data = () => {
    var x = { "data": {
      "BTC": [ 16700, 16895.89, 16837.64, 16925, 16936.11, 16760.87, 16838.29, 16815, 16750, 16749.78, 17158.01, 17398, 17379],
      "ETH": [ 737.4, 747.22, 746.19, 731, 713.13, 707.49, 695.95, 691.11, 703.54, 705.01, 664.01, 669.12, 672.98],
      "LTC": [ 314.51, 313.54, 306.25, 310.16, 301.11, 297, 283.29, 281.31, 283.51, 283.8, 277.5, 277.67, 279.48]
    }}
    return Promise.try(() => { return x.data })
  }

  Lionshare.putItemAsync = (item) => {
    console.log(`STUB putItemAsync ${JSON.stringify(item, null, 2)}`)
    return Promise.try(() => {})
  }

  Lionshare.getItemAsync = (query) => {
    console.log(`STUB getItemAsync ${JSON.stringify(query,null, 2)}`)
    return Promise.try(() => { return { Item: { data: { S: '{ "BTC": 10, "LTC": -1 }' } } } })
  }

  Lionshare.authenticate = (code) => {
    console.log(`STUB authenticate ${code}`)
    return Promise.try(() => {})
  }
})

describe("handle", () => {
  it("should /ls work", () => {
    var event = {
      "path": "/ls",
      "httpMethod": "GET",
      "queryStringParameters": {
        "user_id": "2",
        "text": "",
        "user_name": "alice",
        "team_domain": "team",
        "team_id": "1",
        "token": "t1"
      }
    }

    var handle = Promise.promisify(Lionshare.handle)
    return handle(event, {}).then( (data) => {
      assert.equal(data.statusCode, 200)
      console.log(data)
      assert(_.includes(data.body, "BTC"))
    })
  })

  it("should oauth work", () => {
    var event = {
      "path": "/oauth",
      "httpMethod": "GET",
      "queryStringParameters": {
        "code": "2"
      }
    }
    var handle = Promise.promisify(Lionshare.handle)
    return handle(event, {}).then( (data) => {
      assert.equal(data.statusCode, 302)
    })
  })
})
