# occ-avalara-integration
Oracle Commerce Avalara Integration

Note: node_modules folder is also committed to the github as Oracle Commerce(Server Side Extention) require the libraries in node_modules folder except few lib that already exist in the environment. Refer more at: https://docs.oracle.com/en/cloud/saas/cx-commerce/21d/ccdev/configure-sse.html 


TO-DO:

- Remove the credentials from the code
- Instead of throwing error or status as 400, return as 200 and update error in response. Then check how Oracle handles it.
- Remove unnecessary print statements
- Verify mapping of the tax types in response generator.
- Shipping Tax calculation from shippingGroups -> shippingMethod.
