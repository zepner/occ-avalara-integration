const axios = require("axios");

const fs = require("fs");
const { BadRequestError } = require("../utils/Error");
const constants = require("../constants");

const mock = require("../../data/TaxParams.json");
const { Console } = require("console");

async function calculateTaxFromAvalara(taxParams) {

  //validate logic
  if(!!taxParams.request) {
    taxParams = taxParams.request;
  }
  logmsg("OCC TaxParams Req"); logmsg(JSON.stringify(taxParams));
    
  try {
    validateTaxParams(taxParams);
  } catch (error) {
    return buildErrorTaxResponse(taxParams, error.message);
  }

  const headers = {
    auth: {
      username: "2001542042",
      password: "33A0C8CF5196B6ED",
    },
    "Content-Type": constants.CONTENT_TYPE_APPLICATION_JSON,
  };

  var requestJson = buildRequestJson(taxParams);

  const responseJson = await axios
    .post(
      constants.AVALARA_BASE + constants.NEW_TRANSACTION_ENDPOINT,
      requestJson,
      headers
    )
    .then((result) => {
      logmsg("Ava API Resp"); logmsg(result.data);
      return result.data;
    })
    .catch((error) => {
      logmsg(error.response.data);
      return buildErrorTaxResponse(taxParams, error.response.data);
    });
  logmsg("ava-api responseJson"); logmsg(responseJson);

  if(responseJson.response && responseJson.response.errors) {
    return buildErrorTaxResponse(taxParams, JSON.stringify(responseJson.response.errors));
  }

  var taxCalRes = buildTaxResponse(taxParams, responseJson);
  taxCalRes.response.shippingGroups[0].shippingMethod.tax = 0 ; // Hardcoding the shipping tax to 0.
  logmsg('taxCalRes recalculated'); logmsg(taxCalRes);
  return taxCalRes;
}

function buildErrorTaxResponse(taxParams, error) {
  let taxResponse = {};
  if('callType' in taxParams) taxResponse.callType = taxParams.callType;
  if('creationDate' in taxParams) taxResponse.creationDate = taxParams.creationDate;
  if('orderId' in taxParams) taxResponse.orderId = taxParams.orderId;
  if('orderProfileId' in taxParams) taxResponse.orderProfileId = taxParams.orderProfileId;
  if('orderStatus' in taxParams) taxResponse.orderStatus = taxParams.orderStatus;
  
  taxResponse.status = "failed";
  taxResponse.errors = {
    errorCode: "400",
    message: error
  };
  taxResponse.timestamp = new Date().toISOString();
  return {"response": taxResponse};
}

function buildTaxResponse(taxParams, responseJson) {
  
  let taxResponse = {};
  if('callType' in taxParams) taxResponse.callType = taxParams.callType;
  if('creationDate' in taxParams) taxResponse.creationDate = taxParams.creationDate;
  //if('creationTime' in taxParams) taxResponse.creationTime = taxParams.creationTime;
  //if(!!taxParams.errors) taxResponse.errors = taxParams.errors;
  if('isTaxIncluded' in taxParams) taxResponse.isTaxIncluded = taxParams.isTaxIncluded;
  if('orderId' in taxParams) taxResponse.orderId = taxParams.orderId;
  if('orderProfileId' in taxParams) taxResponse.orderProfileId = taxParams.orderProfileId;
  if('orderStatus' in taxParams) taxResponse.orderStatus = taxParams.orderStatus;
  if('shippingGroups' in taxParams) taxResponse.shippingGroups = taxParams.shippingGroups;
  //if(!!taxParams.status) taxResponse.status = taxParams.status;
  if('taxDate' in taxParams) taxResponse.taxDate = taxParams.taxDate;
  //if(!!taxParams.timestamp) taxResponse.timestamp = taxParams.timestamp;

  let lineIndex = 0;
  let lines = responseJson.lines;

  taxResponse.shippingGroups.forEach((sg) => {
    delete sg.discountInfo;
    delete sg.itemsIsTruncated;
    delete sg.shippingAddress;

    // Not documented
    delete sg.shippingMethod.taxIncluded;

    let cityTax = 0, countyTax = 0, districtTax = 0, stateTax = 0, countryTax = 0, valueAddedTax = 0, miscTax = 0;

    sg.items.forEach((item) => {
      delete item.detailedItemPriceInfo;

      // Not documented
      delete item.amount;
      delete item.pointOfNoRevision;
      delete item.relationshipType;
      delete item.shipFromAddress;
      delete item.asset;

      item.tax = lines[lineIndex].tax;
      item.taxDetails = [];
      lines[lineIndex].details.forEach((d) => {
        var taxDetail = {
          jurisType: d.jurisdictionType,
          rate: d.rate,
          tax: d.tax,
          taxName: d.taxName,
        };
        item.taxDetails.push(taxDetail);
        
        if(d.jurisType === 'STA') stateTax += d.tax;
        else if(d.jurisType === 'CTY') countyTax = d.tax;
        else miscTax += d.tax || 0;
        // todo: Map other types of taxes
      });
      
      lineIndex++;
    });

    sg.taxPriceInfo = {
        "cityTax": cityTax,
        //"secondaryCurrencyTaxAmount":0,
        "amount": parseFloat((cityTax + countyTax + districtTax + stateTax + countryTax + valueAddedTax + miscTax).toFixed(4)),
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

  return {"response": taxResponse};
}

function validateTaxParams(taxParams) {
  try {
    JSON.parse(JSON.stringify(taxParams));
  } catch (error) {
    throw new BadRequestError("Request parameters(json) is not correctly formatted.");
  }

  if(!taxParams.dynamicProperties.filter(x => x.id == 'x_dealerTaxAddress1')[0] 
    || !taxParams.dynamicProperties.filter(x => x.id == 'x_dealerTaxAddress1')[0].value) {
    throw new BadRequestError("Dealer Address is not present");
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
  logmsg("buildRequestJson(taxParams)"); logmsg(taxParams);
  var taxCalReq = {};

  //taxCalReq.type = constants.REQUEST_TYPE_SALES_ORDER;
  taxCalReq.type = constants.REQUEST_TYPE_SALES_INVOICE;
  taxCalReq.companyCode = "YAMAHAUS";
  taxCalReq.date = new Date().toISOString().substring(0, 10);
  taxCalReq.customerCode = "ABC"; // Needed from data.

  var dynamicProperties = taxParams.dynamicProperties;
  logmsg('Dynamic Properties: ' + dynamicProperties);
  
  const dealerAddressPiped = dynamicProperties.filter(x => x.id == 'x_dealerTaxAddress1')[0].value;

  logmsg("Dealer Address Piped"); logmsg(dealerAddressPiped);
  if (dealerAddressPiped.length == 0) {
    return false;
  }
  var dealerAddress = dealerAddressPiped.split('|') ?? [];
  
  logmsg("Dealer Address"); logmsg(dealerAddress);

  // Set shipFrom to dealer address
  taxCalReq.addresses = {
    singleLocation: {
      line1: dealerAddress[0],
      city: dealerAddress[1],
      region: dealerAddress[2],
      postalCode: dealerAddress[3],
      country: 'US',
    },
  };

  taxCalReq.lines = [];
  const items = taxParams.shippingGroups[0].items;
  taxParams.shippingGroups.forEach((sg) => {
    // var taxCode = sg.shippingMethod.taxCode;
    sg.items.forEach((item) => {
      taxCalReq.lines.push({
        amount: item.price,
        taxCode: getTaxCode(taxParams, item.commerceItemId), // Take from shippingGroups or dynamic properties??
      });
    });
  });

  taxCalReq.commit = true;
  taxCalReq.currencyCode = constants.CURRENCY_CODE_USD;

  logmsg("taxCalReq"); logmsg(taxCalReq);
  return taxCalReq;
}

function getTaxCode(taxParams, commerceItemId) {
  taxParams.shoppingCart.items.forEach(item => {
    if(item.commerceItemId === commerceItemId) {
      // strip the help-text from the taxCode
      if (item.taxCode.indexOf(':')) {
        return item.taxCode.split(':')[0];
      } else {
        return item.taxCode;
      }
    }
  });
  return false;
}

function logmsg(msgs) {
  if (global.occ) {
    global.occ.logger.debug(msgs);
  } else {
    console.log(msgs);
  }
}

module.exports = {
  calculateTaxFromAvalara,
};
