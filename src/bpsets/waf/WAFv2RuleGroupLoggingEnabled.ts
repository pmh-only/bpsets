import {
  WAFV2Client,
  ListRuleGroupsCommand,
  GetRuleGroupCommand,
  UpdateRuleGroupCommand,
} from '@aws-sdk/client-wafv2';
import { BPSet, BPSetMetadata, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class WAFv2RuleGroupLoggingEnabled implements BPSet {
  private readonly regionalClient = new WAFV2Client({});
  private readonly globalClient = new WAFV2Client({ region: 'us-east-1' });
  private readonly memoRegionalClient = Memorizer.memo(this.regionalClient);
  private readonly memoGlobalClient = Memorizer.memo(this.globalClient, 'global');

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: [],
  };

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'WAFv2RuleGroupLoggingEnabled',
    description: 'Ensures that AWS WAFv2 Rule Groups have logging enabled.',
    priority: 2,
    priorityReason: 'Enabling logging on WAF Rule Groups helps monitor and audit security.',
    awsService: 'WAFv2',
    awsServiceCategory: 'Web Application Firewall',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'GetRuleGroupCommand',
        reason: 'Retrieve details of a WAFv2 Rule Group.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateRuleGroupCommand',
        reason: 'Enable logging for the WAFv2 Rule Group.',
      },
    ],
    adviseBeforeFixFunction: 'Ensure necessary CloudWatch permissions are granted for logging.',
  });

  public readonly getStats = () => this.stats;

  public readonly clearStats = () => {
    this.stats.compliantResources = [];
    this.stats.nonCompliantResources = [];
    this.stats.status = 'LOADED';
    this.stats.errorMessage = [];
  };

  public readonly check = async () => {
    this.stats.status = 'CHECKING';

    await this.checkImpl()
      .then(() => {
        this.stats.status = 'FINISHED';
      })
      .catch((err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message,
        });
      });
  };

  private readonly checkImpl = async () => {
    const compliantResources: string[] = [];
    const nonCompliantResources: string[] = [];

    for (const scope of ['REGIONAL', 'CLOUDFRONT'] as const) {
      const client = scope === 'REGIONAL' ? this.memoRegionalClient : this.memoGlobalClient;
      const ruleGroups = await this.getRuleGroups(scope);

      for (const ruleGroup of ruleGroups) {
        const details = await client.send(
          new GetRuleGroupCommand({ Name: ruleGroup.Name!, Id: ruleGroup.Id!, Scope: scope })
        );

        if (details.RuleGroup?.VisibilityConfig?.CloudWatchMetricsEnabled) {
          compliantResources.push(ruleGroup.ARN!);
        } else {
          nonCompliantResources.push(ruleGroup.ARN!);
        }
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  private readonly getRuleGroups = async (scope: 'REGIONAL' | 'CLOUDFRONT') => {
    const client = scope === 'REGIONAL' ? this.memoRegionalClient : this.memoGlobalClient;
    const response = await client.send(new ListRuleGroupsCommand({ Scope: scope }));
    return response.RuleGroups || [];
  };

  public readonly fix = async (nonCompliantResources: string[]) => {
    this.stats.status = 'CHECKING';

    await this.fixImpl(nonCompliantResources)
      .then(() => {
        this.stats.status = 'FINISHED';
      })
      .catch((err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message,
        });
      });
  };

  private readonly fixImpl = async (nonCompliantResources: string[]) => {
    for (const arn of nonCompliantResources) {
      const client = arn.includes('global') ? this.globalClient : this.regionalClient;
      const [name, id] = arn.split('/')[1].split(':');

      await client.send(
        new UpdateRuleGroupCommand({
          Name: name,
          Id: id,
          Scope: arn.includes('global') ? 'CLOUDFRONT' : 'REGIONAL',
          VisibilityConfig: {
            CloudWatchMetricsEnabled: true,
            MetricName: `WAFRuleGroup-${name}`,
            SampledRequestsEnabled: true,
          },
          LockToken: undefined, // Replace with actual LockToken if needed.
        })
      );
    }
  };
}
