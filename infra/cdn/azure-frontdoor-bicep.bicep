// Azure Front Door / CDN Security Profile Definition for Secure Player VOD
param frontDoorProfileName string = 'afd-fonixedu-secureplayer'
param endpointName string = 'ep-fonixedu-secure'
param storageAccountName string = 'fonixedugrading'

resource frontDoorProfile 'Microsoft.Cdn/profiles@2021-06-01' = {
  name: frontDoorProfileName
  location: 'global'
  sku: {
    name: 'Premium_AzureFrontDoor'
  }
}

resource frontDoorEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2021-06-01' = {
  parent: frontDoorProfile
  name: endpointName
  location: 'global'
  properties: {
    enabledState: 'Enabled'
  }
}

// Edge WAF Policy: Rate Limiting & Geo Blocking
resource frontDoorWafPolicy 'Microsoft.Network/frontdoorwebapplicationfirewallpolicies@2022-05-01' = {
  name: 'wafFonixEduSecurity'
  location: 'global'
  sku: {
    name: 'Premium_AzureFrontDoor'
  }
  properties: {
    policySettings: {
      enabledState: 'Enabled'
      mode: 'Prevention'
      customBlockResponseStatusCode: 403
      customBlockResponseBody: 'eyJzdGF0dXMiOjQwMywiZXJyb3IiOiJFZGdlIFdBRiBSYXRlIExpbWl0IEV4Y2VlZGVkIn0='
    }
    customRules: {
      rules: [
        {
          name: 'RateLimitSegmentScraping',
          priority: 100,
          ruleType: 'RateLimitRule',
          rateLimitThreshold: 120,
          rateLimitDurationInMinutes: 1,
          action: 'Block',
          matchConditions: [
            {
              matchVariable: 'RequestUri',
              operator: 'Contains',
              matchValue: [
                '.ts'
              ]
            }
          ]
        }
      ]
    }
  }
}
