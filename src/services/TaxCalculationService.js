const axios = require("axios");

const fs = require("fs");
const { BadRequestError } = require("../utils/Error");
const constants = require("../constants");

const mock = require("../../data/TaxParams.json");

async function calculateTaxFromAvalara(taxParams) {

  if(!!taxParams.request) {
    taxParams = taxParams.request;
  }
  
  if (global.occ) {
    global.occ.logger.debug(
        "TaxParams Request from Oracle Commerce: \n." + JSON.stringify(taxParams)
    );
  }
    
  try {
    validateTaxParams(taxParams);
  } catch (error) {
    throw error;
  }

  const headers = {
    auth: {
      username: "2001542042",
      password: "1145AB49A2DB0CF9",
    },
    "Content-Type": constants.CONTENT_TYPE_APPLICATION_JSON,
  };

  var requestJson = buildRequestJson(taxParams);
  //var responseJson;

  if (global.occ) {
    global.occ.logger.debug(
      "Starting request: \n." + JSON.stringify(requestJson)
    );
  }

  const responseJson = await axios
    .post(
      constants.AVALARA_BASE + constants.NEW_TRANSACTION_ENDPOINT,
      requestJson,
      headers
    )
    .then((result) => {
      if (global.occ) {
        global.occ.logger.debug(
          "Response from Avalara: " + JSON.stringify(result.data)
        );
      }
      return result.data;
    })
    .catch((error) => console.log(JSON.stringify(error.response.data)));

  var taxCalRes = buildTaxResponse(taxParams, responseJson);
  if(global.occ) {
    global.occ.logger.debug(
        "Inside service: \n" + JSON.stringify(taxCalRes, null, 2)
    );
  }
  return {"response": taxCalRes};
}

function buildTaxResponse(taxParams, responseJson) {
  //var taxResponse = { ...taxParams };

  /*delete taxResponse.giftWithPurchaseInfo;
  delete taxResponse.priceInfo;
  delete taxResponse.profile;
  delete taxResponse.shipFromAddress;
  delete taxResponse.shoppingCart;
  delete taxResponse.creationSiteId;
  delete taxResponse.dynamicProperties;
  delete taxResponse.allowAlternateCurrency;
  delete taxResponse.priceListGroup;
  */

  var taxResponse = {};
  if('callType' in taxParams) taxResponse.callType = taxParams.callType;
  if('creationDate' in taxParams) taxResponse.creationDate = taxParams.creationDate;
  if('creationTime' in taxParams) taxResponse.creationTime = taxParams.creationTime;
  //if(!!taxParams.errors) taxResponse.errors = taxParams.errors;
  if('isTaxIncluded' in taxParams) taxResponse.isTaxIncluded = taxParams.isTaxIncluded;
  if('orderId' in taxParams) taxResponse.orderId = taxParams.orderId;
  if('orderProfileId' in taxParams) taxResponse.orderProfileId = taxParams.orderProfileId;
  if('orderStatus' in taxParams) taxResponse.orderStatus = taxParams.orderStatus;
  if('shippingGroups' in taxParams) taxResponse.shippingGroups = taxParams.shippingGroups;
  //if(!!taxParams.status) taxResponse.status = taxParams.status;
  if('taxDate' in taxParams) taxResponse.taxDate = taxParams.taxDate;
  //if(!!taxParams.timestamp) taxResponse.timestamp = taxParams.timestamp;


  var lineIndex = 0;
  var lines = responseJson.lines;

  taxResponse.shippingGroups.forEach((sg) => {
    delete sg.discountInfo;
    delete sg.itemsIsTruncated;
    delete sg.shippingAddress;

    // Not documented
    delete sg.shippingMethod.taxIncluded;

    let cityTax = 0, countyTax = 0, districtTax = 0, stateTax = 0, countryTax = 0, valueAddedTax = 0, miscTax = 0;

    sg.items.forEach((item) => {
      delete item.detailedItemPriceInfo;

      //Not documented
      delete item.amount;
      delete item.pointOfNoRevision;
      delete item.relationshipType;
      delete item.shipFromAddress;
      delete item.asset;
      ///
      

      item.tax = lines[lineIndex].tax;
      item.taxDetails = [];
      lines[lineIndex].details.forEach((d) => {
        var taxDetail = {
          jurisType: d.jurisType,
          rate: d.rate,
          tax: d.tax,
          taxName: d.taxName,
        };
        item.taxDetails.push(taxDetail);
        
        if(d.jurisType === 'STA') stateTax += d.tax;
        else if(d.jurisType === 'CTY') countyTax = d.tax;
        else miscTax += d.tax || 0;

        // TO-DO: Map other types of taxes;


      });
      
      lineIndex++;
    });

    sg.taxPriceInfo = {
        "cityTax": cityTax,
        //"secondaryCurrencyTaxAmount":0,
        "amount": cityTax + countyTax + districtTax + stateTax + countryTax + valueAddedTax + miscTax,
        "valueAddedTax": valueAddedTax,
        "countyTax": countyTax,
        "isTaxIncluded": taxParams.isTaxIncluded,
        "miscTax": miscTax,
        "districtTax": districtTax,
        "stateTax": stateTax,
        "countryTax": countryTax
    };

    sg.priceInfo.tax = sg.taxPriceInfo.amount;
    sg.priceInfo.total += sg.priceInfo.tax;
  });

  

  taxResponse.status = "success";
  taxResponse.timestamp = new Date().toISOString();

  return taxResponse;
}

function validateTaxParams(taxParams) {
  try {
    JSON.parse(JSON.stringify(taxParams));
  } catch (error) {
    throw new BadRequestError("Request parameters(json) is not correctly formatted.");
  }

  const shipFromAddress = taxParams.shipFromAddress;
  if (
    !(
      shipFromAddress &&
      shipFromAddress.city &&
      shipFromAddress.state &&
      shipFromAddress.country &&
      shipFromAddress.postalCode
    )
  ) {
    throw new BadRequestError("Ship From Address is not complete");
  }

  const shippingGroups = taxParams.shippingGroups;
  if (!shippingGroups || !shippingGroups.length || shippingGroups.length <= 0) {
    throw new BadRequestError("Shipping Groups are not present");
  }

  if (!shippingGroups[0].items || shippingGroups[0].items.length <= 0) {
    throw new BadRequestError("Shipping Group has no items");
  }
}

function buildRequestJson(taxParams) {
  var taxCalReq = {};

  taxCalReq.type = constants.REQUEST_TYPE_SALES_ORDER;
  taxCalReq.companyCode = "YAMAHAUS";
  taxCalReq.date = new Date().toISOString().substring(0, 10);
  taxCalReq.customerCode = "ABC"; // Needed from data.

  const shipFromAddress = taxParams.shipFromAddress;

  // Assuming the location of the dealer is a single location. Means all goods are shipped from single location"
  taxCalReq.addresses = {
    singleLocation: {
      line1: shipFromAddress.address1,
      city: shipFromAddress.city,
      region: shipFromAddress.state,
      country: shipFromAddress.country,
      postalCode: shipFromAddress.postalCode,
    },
  };

  taxCalReq.lines = [];

  const items = taxParams.shippingGroups[0].items;
  taxParams.shippingGroups.forEach((sg) => {
    var taxCode = sg.shippingMethod.taxCode;
    sg.items.forEach((item) => {
      taxCalReq.lines.push({
        amount: item.price,
        taxCode: taxCode, // Take from shippingGroups or dynamic properties??
      });
    });
  });

  taxCalReq.commit = false;
  taxCalReq.currencyCode = constants.CURRENCY_CODE_USD;

  /*taxCalReq = 
    {
        "lines": [
            {
            "number": "1",
            "quantity": 1,
            "amount": 100,
            "taxCode": "PS081282",
            "itemCode": "Y0001",
            "description": "Yarn"
            }
        ],
        "type": "SalesOrder",
        //"companyCode": "DEFAULT",
        "date": "2022-10-07",
        "customerCode": "ABC",
        //"purchaseOrderNo": "2022-10-07-001",
        "addresses": {
            "singleLocation": {
                "line1": "2000 Main Street",
                "city": "Irvine",
                "region": "CA",
                "country": "US",
                "postalCode": "92614"
            }
        },
        "commit": false,
        "currencyCode": "USD",
        //"description": "Yarn"
    };*/

  console.log(taxCalReq);
  return taxCalReq;
}

function getMockedTaxParams() {
  return JSON.parse(fs.readFileSync("data/TaxParams.json", "utf8"));
}

module.exports = {
  calculateTaxFromAvalara,
};