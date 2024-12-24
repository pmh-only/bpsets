import {
  WAFV2Client,
  ListWebACLsCommand,
  GetWebACLCommand,
  UpdateWebACLCommand
} from '@aws-sdk/client-wafv2';
import { BPSet } from '../BPSet';
import { Memorizer } from '../../Memorizer';

export class WAFv2WebACLNotEmpty implements BPSet {
  private readonly regionalClient = new WAFV2Client({});
  private readonly globalClient = new WAFV2Client({ region: 'us-east-1' });
  private readonly memoRegionalClient = Memorizer.memo(this.regionalClient);
  private readonly memoGlobalClient = Memorizer.memo(this.globalClient);

  private readonly getWebACLs = async (scope: 'REGIONAL' | 'CLOUDFRONT') => {
    const client = scope === 'REGIONAL' ? this.memoRegionalClient : this.memoGlobalClient;
    const response = await client.send(new ListWebACLsCommand({ Scope: scope }));
    return response.WebACLs || [];
  };

  public readonly check = async () => {
    const compliantResources: string[] = [];
    const nonCompliantResources: string[] = [];

    for (const scope of ['REGIONAL', 'CLOUDFRONT'] as const) {
      const client = scope === 'REGIONAL' ? this.memoRegionalClient : this.memoGlobalClient;
      const webACLs = await this.getWebACLs(scope);

      for (const webACL of webACLs) {
        const details = await client.send(
          new GetWebACLCommand({ Name: webACL.Name!, Id: webACL.Id!, Scope: scope })
        );

        if (details.WebACL?.Rules?.length! > 0) {
          compliantResources.push(webACL.ARN!);
        } else {
          nonCompliantResources.push(webACL.ARN!);
        }
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'default-rule', value: '<DEFAULT_RULE>' }]
    };
  };

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const defaultRule = requiredParametersForFix.find(param => param.name === 'default-rule')?.value;

    if (!defaultRule) {
      throw new Error("Required parameter 'default-rule' is missing.");
    }

    for (const arn of nonCompliantResources) {
      const client = arn.includes('global') ? this.globalClient : this.regionalClient;

      const [name, id] = arn.split('/')[1].split(':');

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
      );
    }
  };
}
