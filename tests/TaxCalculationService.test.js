const taxCalculationService = require("./../src/services/TaxCalculationService");
const axios = require("axios");
const fs = require("fs");
const { BadRequestError } = require("./../src/utils/Error");
const {
  AVALARA_BASE,
  NEW_TRANSACTION_ENDPOINT,
  REQUEST_TYPE_SALES_ORDER,
  CURRENCY_CODE_USD,
} = require("../src/constants");

jest.mock("axios");
const mockedAvalaraTaxResponse = JSON.parse(
  fs.readFileSync("tests/AvalaraTaxResponseMocked.json", "utf8")
);

test("calculateTaxFromAvalara should return correct response", async () => {
  const mockedOracleWebRequest = JSON.parse(
    fs.readFileSync("data/TaxParams.json", "utf8")
  );
  axios.post.mockResolvedValue(mockedAvalaraTaxResponse);
  const taxResponse = await taxCalculationService.calculateTaxFromAvalara(
    mockedOracleWebRequest
  );
  expect(taxResponse.shippingGroups[0].items[0].tax).toBe(3.7);
});

test("calculateTaxFromAvalara throw error if shipFromAddress is not present in request", async () => {
  const mockedOracleWebRequest = JSON.parse(
    fs.readFileSync("data/TaxParams.json", "utf8")
  );
  delete mockedOracleWebRequest.shipFromAddress;
  try {
    const taxResponse = await taxCalculationService.calculateTaxFromAvalara(
      mockedOracleWebRequest
    );
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestError);
  }
});

test("calculateTaxFromAvalara throw error if shippingGroup is not present in request", async () => {
  const mockedOracleWebRequest = JSON.parse(
    fs.readFileSync("data/TaxParams.json", "utf8")
  );
  delete mockedOracleWebRequest.shippingGroups;
  try {
    const taxResponse = await taxCalculationService.calculateTaxFromAvalara(
      mockedOracleWebRequest
    );
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestError);
  }
});

test("calculateTaxFromAvalara should build Avalara Req Json correctly", async () => {
  const mockedOracleWebRequest = JSON.parse(
    fs.readFileSync("data/TaxParams.json", "utf8")
  );
  axios.post.mockResolvedValue(mockedAvalaraTaxResponse);
  const taxResponse = await taxCalculationService.calculateTaxFromAvalara(
    mockedOracleWebRequest
  );
  var postBody = axios.post.mock.calls[0][1];
  expect(axios.post.mock.calls[0][0]).toBe(
    AVALARA_BASE + NEW_TRANSACTION_ENDPOINT
  );

  expect(postBody.type).toBe(REQUEST_TYPE_SALES_ORDER);
  expect(postBody.companyCode).toBe("YAMAHAUS");
  expect(postBody.customerCode).toBe("ABC");
  expect(postBody.addresses.singleLocation.line1).toBe("1 main st");
  expect(postBody.addresses.singleLocation.city).toBe("Cambridge");
  expect(postBody.addresses.singleLocation.region).toBe("MA");
  expect(postBody.addresses.singleLocation.country).toBe("US");
  expect(postBody.addresses.singleLocation.postalCode).toBe("02142");

  expect(postBody.lines.length).not.toBe(0);
  expect(postBody.lines[0].amount).toBe(59.96);

  expect(postBody.commit).toBe(false);
  expect(postBody.currencyCode).toBe(CURRENCY_CODE_USD);
});

test("calculateTaxFromAvalara should build Tax Response Json correctly", async () => {
  const mockedOracleWebRequest = JSON.parse(
    fs.readFileSync("data/TaxParams.json", "utf8")
  );
  axios.post.mockResolvedValue(mockedAvalaraTaxResponse);
  const taxResponse = await taxCalculationService.calculateTaxFromAvalara(
    mockedOracleWebRequest
  );

  const shippingGroups = taxResponse.shippingGroups;
  expect(shippingGroups.length).not.toBe(0);
  expect(shippingGroups[0].items.length).not.toBe(0);

  expect(shippingGroups[0].items[0].tax).toBe(3.7);
  expect(shippingGroups[0].items[0].taxDetails[0].jurisType).toBe("STA");
  expect(shippingGroups[0].items[0].taxDetails[0].tax).toBe(3.7);
  expect(shippingGroups[0].items[0].taxDetails[0].taxName).toBe("MA STATE TAX");
  expect(shippingGroups[0].items[0].taxDetails[0].rate).toBe(0.0625);
});
