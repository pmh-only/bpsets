import { WAFV2Client, ListRuleGroupsCommand, GetRuleGroupCommand, UpdateRuleGroupCommand } from '@aws-sdk/client-wafv2'
import { BPSet, BPSetFixFn, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class WAFv2RuleGroupNotEmpty implements BPSet {
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
    name: 'WAFv2RuleGroupNotEmpty',
    description: 'Ensures WAFv2 Rule Groups are not empty and contain at least one rule.',
    priority: 2,
    priorityReason: 'Empty rule groups provide no security benefit and should be avoided.',
    awsService: 'WAFv2',
    awsServiceCategory: 'Web Application Firewall',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [
      {
        name: 'default-rule',
        description: 'Default rule JSON to populate empty rule groups.',
        default: '{}',
        example: '{"IpSetReferenceStatement": {"Arn": "example-arn"}}'
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'GetRuleGroupCommand',
        reason: 'Retrieve details of a WAFv2 Rule Group to check its rules.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateRuleGroupCommand',
        reason: 'Add default rule to empty WAFv2 Rule Groups.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure the default rule JSON is correctly formatted and meets security requirements.'
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
      const ruleGroups = await this.getRuleGroups(scope)

      for (const ruleGroup of ruleGroups) {
        const details = await client.send(
          new GetRuleGroupCommand({ Name: ruleGroup.Name!, Id: ruleGroup.Id!, Scope: scope })
        )

        if ((details.RuleGroup?.Rules?.length ?? 0) > 0) {
          compliantResources.push(ruleGroup.ARN!)
        } else {
          nonCompliantResources.push(ruleGroup.ARN!)
        }
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  private readonly getRuleGroups = async (scope: 'REGIONAL' | 'CLOUDFRONT') => {
    const client = scope === 'REGIONAL' ? this.memoRegionalClient : this.memoGlobalClient
    const response = await client.send(new ListRuleGroupsCommand({ Scope: scope }))
    return response.RuleGroups || []
  }

  public readonly fix: BPSetFixFn = async (...args) => {
    this.stats.status = 'CHECKING'

    await this.fixImpl(...args)
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
        new UpdateRuleGroupCommand({
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
          VisibilityConfig: {
            CloudWatchMetricsEnabled: true,
            MetricName: `RuleGroup-${name}`,
            SampledRequestsEnabled: true
          }
        })
      )
    }
  }
}
