import {
  WAFV2Client,
  ListRuleGroupsCommand,
  GetRuleGroupCommand,
  UpdateRuleGroupCommand,
} from '@aws-sdk/client-wafv2';
import { BPSet } from '../../types';
import { Memorizer } from '../../Memorizer';

export class WAFv2RuleGroupLoggingEnabled implements BPSet {
  private readonly regionalClient = new WAFV2Client({});
  private readonly globalClient = new WAFV2Client({ region: 'us-east-1' });
  private readonly memoRegionalClient = Memorizer.memo(this.regionalClient);
  private readonly memoGlobalClient = Memorizer.memo(this.globalClient, 'global');

  private readonly getRuleGroups = async (scope: 'REGIONAL' | 'CLOUDFRONT') => {
    const client = scope === 'REGIONAL' ? this.memoRegionalClient : this.memoGlobalClient;
    const response = await client.send(new ListRuleGroupsCommand({ Scope: scope }));
    return response.RuleGroups || [];
  };

  public readonly check = async () => {
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

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [],
    };
  };

  public readonly fix = async (nonCompliantResources: string[]) => {
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
          LockToken: undefined
        })
      );
    }
  };
}
