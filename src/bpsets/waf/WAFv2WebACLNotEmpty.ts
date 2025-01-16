import { WAFV2Client, ListWebACLsCommand, GetWebACLCommand, UpdateWebACLCommand } from '@aws-sdk/client-wafv2'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class WAFv2WebACLNotEmpty implements BPSet {
  private readonly regionalClient = new WAFV2Client({})
  private readonly globalClient = new WAFV2Client({ region: 'us-east-1' })
  private readonly memoRegionalClient = Memorizer.memo(this.regionalClient)
  private readonly memoGlobalClient = Memorizer.memo(this.globalClient, 'global')

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'WAFv2WebACLNotEmpty',
    description: 'Ensures WAFv2 Web ACLs are not empty and contain at least one rule.',
    priority: 2,
    priorityReason: 'Empty Web ACLs provide no protection and should contain at least one rule.',
    awsService: 'WAFv2',
    awsServiceCategory: 'Web Application Firewall',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [
      {
        name: 'default-rule',
        description: 'Default rule JSON to populate empty Web ACLs.',
        default: '{}',
        example: '{"IpSetReferenceStatement": {"Arn": "example-arn"}}'
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'GetWebACLCommand',
        reason: 'Retrieve details of a WAFv2 Web ACL to check its rules.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateWebACLCommand',
        reason: 'Add a default rule to empty Web ACLs.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure the default rule JSON is correctly formatted and aligns with security requirements.'
  })

  public readonly getStats = () => this.stats

  public readonly clearStats = () => {
    this.stats.compliantResources = []
    this.stats.nonCompliantResources = []
    this.stats.status = 'LOADED'
    this.stats.errorMessage = []
  }

  public readonly check = async () => {
    this.stats.status = 'CHECKING'

    await this.checkImpl()
      .then(() => {
        this.stats.status = 'FINISHED'
      })
      .catch((err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      })
  }

  private readonly checkImpl = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []

    for (const scope of ['REGIONAL', 'CLOUDFRONT'] as const) {
      const client = scope === 'REGIONAL' ? this.memoRegionalClient : this.memoGlobalClient
      const webACLs = await this.getWebACLs(scope)

      for (const webACL of webACLs) {
        const details = await client.send(new GetWebACLCommand({ Name: webACL.Name!, Id: webACL.Id!, Scope: scope }))

        if (details.WebACL?.Rules?.length ?? 0 > 0) {
          compliantResources.push(webACL.ARN!)
        } else {
          nonCompliantResources.push(webACL.ARN!)
        }
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  private readonly getWebACLs = async (scope: 'REGIONAL' | 'CLOUDFRONT') => {
    const client = scope === 'REGIONAL' ? this.memoRegionalClient : this.memoGlobalClient
    const response = await client.send(new ListWebACLsCommand({ Scope: scope }))
    return response.WebACLs || []
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    this.stats.status = 'CHECKING'

    await this.fixImpl(nonCompliantResources, requiredParametersForFix)
      .then(() => {
        this.stats.status = 'FINISHED'
      })
      .catch((err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      })
  }

  private readonly fixImpl = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const defaultRule = requiredParametersForFix.find((param) => param.name === 'default-rule')?.value

    if (!defaultRule) {
      throw new Error("Required parameter 'default-rule' is missing.")
    }

    for (const arn of nonCompliantResources) {
      const client = arn.includes('global') ? this.globalClient : this.regionalClient
      const [name, id] = arn.split('/')[1].split(':')

      await client.send(
        new UpdateWebACLCommand({
          Name: name,
          Id: id,
          Scope: arn.includes('global') ? 'CLOUDFRONT' : 'REGIONAL',
          LockToken: undefined,
          Rules: [
            {
              Name: 'DefaultRule',
              Priority: 1,
              Action: { Allow: {} },
              Statement: JSON.parse(defaultRule),
              VisibilityConfig: {
                CloudWatchMetricsEnabled: true,
                MetricName: `DefaultRule-${name}`,
                SampledRequestsEnabled: true
              }
            }
          ],
          DefaultAction: { Allow: {} },
          VisibilityConfig: {
            CloudWatchMetricsEnabled: true,
            MetricName: `WebACL-${name}`,
            SampledRequestsEnabled: true
          }
        })
      )
    }
  }
}
