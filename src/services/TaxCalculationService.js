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
  logmsg("=== OCC TaxParams Req", JSON.stringify(taxParams));
    
  try {
    taxParams = validateTaxParams(taxParams);
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
      // logmsg("Ava API Resp"); logmsg(result.data);
      return result.data;
    })
    .catch((error) => {
      //logmsg(error.response.data);
      return buildErrorTaxResponse(taxParams, error.response.data);
    });
  // logmsg("ava-api responseJson"); logmsg(responseJson);

  if(responseJson.response && responseJson.response.errors) {
    return buildErrorTaxResponse(taxParams, JSON.stringify(responseJson.response.errors));
  }

  var taxCalRes = buildTaxResponse(taxParams, responseJson);
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
  logmsg("=== buildTaxResponse(taxParams, responseJson)");
  logmsg(JSON.stringify(taxParams));
  logmsg(JSON.stringify(responseJson));
  let taxResponse = {};
  if('callType' in taxParams) taxResponse.callType = responseJson.callType;
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

  let lines = responseJson.lines;

  // Calculate Shipping Tax
  let shippingTaxBefore = 0;
  let shippingTaxDetails = [];
  lines.filter(line => line.description === 'Shipping').forEach((line) => {
    // logmsg(['lines-line', line.description, line.details]);
    shippingTaxBefore += line.tax;
    // add to sg.items

    line.details.forEach((d) => {
      logmsg(['Shipping Method: ', line.description, d.jurisdictionType, d.jurisType, d.taxName, d.tax]);
      var taxDetail = {
        jurisType: d.jurisdictionType,
        rate: (!taxParams.returnZero) ? d.rate : 0,
        tax: (!taxParams.returnZero) ? d.tax : 0,
        taxName: d.taxName,
      };
      shippingTaxDetails.push(taxDetail);
    });

  });
  taxResponse.shippingGroups[0].shippingMethod.tax = shippingTaxBefore ;
  taxResponse.shippingGroups[0].shippingMethod.taxDetails = shippingTaxDetails ;


  // From taxParams.shippingGroups
  let lineIndex = 0;
  taxResponse.shippingGroups.forEach((sg, sgIndex) => {
    delete sg.discountInfo;
    delete sg.itemsIsTruncated;
    delete sg.shippingAddress;

    // Not documented
    delete sg.shippingMethod.taxIncluded;

    let cityTax = 0, countyTax = 0, districtTax = 0, stateTax = 0, countryTax = 0, valueAddedTax = 0, miscTax = 0, shippingTax = 0;
    var fullTaxDetails = [];
    sg.items.forEach((item) => {
      delete item.detailedItemPriceInfo;

      // Not documented
      delete item.amount;
      delete item.pointOfNoRevision;
      delete item.relationshipType;
      delete item.shipFromAddress;
      delete item.asset;

      // tax hax to keep these all at zero until we do a better reponse that doesn't
      // actually hit Avalara for default calc. 
      
      item.tax = lines[lineIndex].tax;
      item.taxDetails = [];
      let description = lines[lineIndex].description;
      lines[lineIndex].details.forEach((d) => {
        logmsg([description, d.jurisdictionType, d.jurisType, d.taxName, d.tax]);
        var taxDetail = {
          jurisType: d.jurisdictionType,
          rate: (!taxParams.returnZero) ? d.rate : 0,
          tax: (!taxParams.returnZero) ? d.tax : 0,
          taxName: d.taxName,
        };
        item.taxDetails.push(taxDetail);
   
        // CNT - Country code
        // STA - State code
        // CTY - County code
        // CIT - City code
        // STJ - Special tax jurisdiction
        // more tax hax to skip adding these values
        if (!taxParams.returnZero){
          if(description === "Shipping") {
            shippingTax += d.tax;
            logmsg(" === accumulating shippingtax === ");
            logmsg([shippingTax, d.tax]);
          }
          switch(d.jurisdictionType) {
            case "State":
              stateTax += d.tax;
              break;
            case "Country":
              countryTax += d.tax;
              break;
            case "City":
              cityTax += d.tax;
              break;
            case "County":
              countyTax += d.tax;
              break;
            default:
              miscTax += d.tax;
          }

          logmsg(['stateTax: ', stateTax, ' countyTax: ', countyTax, ' miscTax: ', miscTax]);
        }
        // todo: Map other types of taxes
      });
      lineIndex++;
    });
    sg.shippingMethod.tax = shippingTaxBefore;
    sg.taxPriceInfo = {
        "cityTax": cityTax,
        //"secondaryCurrencyTaxAmount":0,
        "amount": parseFloat((cityTax + countyTax + districtTax + stateTax + countryTax + valueAddedTax + miscTax + shippingTaxBefore).toFixed(4)),
        "valueAddedTax": valueAddedTax,
        "countyTax": countyTax,
        "isTaxIncluded": taxParams.isTaxIncluded,
        "miscTax": miscTax,
        "districtTax": districtTax,
        "stateTax": stateTax,
        "countryTax": countryTax,
        "shippingTax": shippingTaxBefore
    };

    sg.priceInfo.tax = sg.taxPriceInfo.amount;
    sg.priceInfo.total += sg.priceInfo.tax;
  });

  taxResponse.status = "success";
  taxResponse.timestamp = new Date().toISOString();
  logmsg(["=== buildTaxResponse-taxResponse", JSON.stringify(taxResponse)]);
  return {"response": taxResponse};
}

function validateTaxParams(taxParams) {

  taxParams.returnZero = false;
  try {
    JSON.parse(JSON.stringify(taxParams));
  } catch (error) {
    throw new BadRequestError("Request parameters(json) is not correctly formatted.");
  }

  const shippingGroups = taxParams.shippingGroups;
  if (!shippingGroups || !shippingGroups.length || shippingGroups.length <= 0) {
    logmsg("Shipping Groups are not present");
    throw new BadRequestError("Shipping Groups are not present");
  }

  if (!shippingGroups[0].items || shippingGroups[0].items.length <= 0) {
    logmsg("Shipping Group has no items");
    throw new BadRequestError("Shipping Group has no items");
  }

  if (taxParams.shippingGroups[0].shippingAddress.postalCode.length <= 0) {
    taxParams.shippingGroups[0].shippingAddress.postalCode = "90630";
    taxParams.shippingGroups[0].shippingAddress.state = "CA";
    taxParams.shippingGroups[0].shippingAddress.city = "Cypress";
    taxParams.shippingGroups[0].shippingAddress.address1 = "6555 Katella Avenue";
    taxParams.returnZero = true;
  }
  return taxParams;
}

function buildRequestJson(taxParams) {
  logmsg("===buildRequestJson(taxParams)"); 
  logmsg(JSON.stringify(taxParams));
  var taxCalReq = {};

  // taxCalReq.type = taxParams.callType; 
  taxCalReq.type = constants.REQUEST_TYPE_SALES_INVOICE;
  taxCalReq.companyCode = "YAMAHAUS";
  taxCalReq.date = new Date().toISOString().substring(0, 10);
  taxCalReq.customerCode = "ECMCST"; // Needed from data.
  if('orderId' in taxParams) taxCalReq.code = taxParams.orderId;

  var dynamicProperties = taxParams.dynamicProperties;  
  const dealerAddressPiped = dynamicProperties.filter(x => x.id == 'x_dealerTaxAddress1')[0].value ?? '6555 Katella Avenue|Cypress|CA|90630';
  var dealerAddress = dealerAddressPiped.split('|') ?? [];
  //logmsg("Dealer Address"); logmsg(dealerAddress);

  var shipToAddress = taxParams.shippingGroups[0].shippingAddress;
  var shippingMethod = taxParams.shippingGroups[0].shippingMethod;

  // Set shipFrom to dealer address
  taxCalReq.addresses = {
    shipFrom: {
      line1: dealerAddress[0],
      city: dealerAddress[1],
      region: dealerAddress[2],
      postalCode: dealerAddress[3],
      country: 'US',
    },
    shipTo: {
      line1: shipToAddress.address1,
      city: shipToAddress.city,
      region: shipToAddress.state,
      postalCode: shipToAddress.postalCode,
      country: 'US',
    }
  };

  taxCalReq.lines = [];
  taxParams.shippingGroups.forEach((sg) => {
    // var taxCode = sg.shippingMethod.taxCode;
    sg.items.forEach((item) => {
      taxCalReq.lines.push({
        quantity: item.quantity,
        amount: item.price,
        description: item.catRefId,
        taxCode: getTaxCode(taxParams, item.commerceItemId), // Take from shippingGroups or dynamic properties??
      });
    });
  });
  taxCalReq.lines.push({
    quantity: 1,
    amount: shippingMethod.cost,
    description: "Shipping",
    taxCode: "FR020100", // Take from shippingGroups or dynamic properties??
  })

  taxCalReq.commit = true; //('payments' in taxParams);
  taxCalReq.currencyCode = constants.CURRENCY_CODE_USD;

  logmsg("taxCalReq"); logmsg(taxCalReq);
  return taxCalReq;
}

function getTaxCode(taxParams, commerceItemId) {
  taxParams.shoppingCart.items.forEach(item => {
    if(item.commerceItemId === commerceItemId) {
      // strip the help-text from the taxCode
      if (item.taxCode && item.taxCode !== null && item.taxCode !== undefined) {
        if (item.taxCode.indexOf(':')) {
          return item.taxCode.split(':')[0];
        } else {
          return item.taxCode;
        }
      }
    }
  });
  return 'P0000000';
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
