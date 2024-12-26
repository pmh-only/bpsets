import {
  WAFV2Client,
  ListWebACLsCommand,
  GetLoggingConfigurationCommand,
  PutLoggingConfigurationCommand,
} from '@aws-sdk/client-wafv2';
import { BPSet } from '../../types';
import { Memorizer } from '../../Memorizer';

export class WAFv2LoggingEnabled implements BPSet {
  private readonly regionalClient = new WAFV2Client({});
  private readonly globalClient = new WAFV2Client({ region: 'us-east-1' });
  private readonly memoRegionalClient = Memorizer.memo(this.regionalClient);
  private readonly memoGlobalClient = Memorizer.memo(this.globalClient, 'global');

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
        try {
          await client.send(new GetLoggingConfigurationCommand({ ResourceArn: webACL.ARN }));
          compliantResources.push(webACL.ARN!);
        } catch (error: any) {
          if (error.name === 'WAFNonexistentItemException') {
            nonCompliantResources.push(webACL.ARN!);
          } else {
            throw error;
          }
        }
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'log-group-arn', value: '<LOG_GROUP_ARN>' }],
    };
  };

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const logGroupArn = requiredParametersForFix.find(param => param.name === 'log-group-arn')?.value;

    if (!logGroupArn) {
      throw new Error("Required parameter 'log-group-arn' is missing.");
    }

    for (const arn of nonCompliantResources) {
      const client = arn.includes('global') ? this.globalClient : this.regionalClient;

      await client.send(
        new PutLoggingConfigurationCommand({
          LoggingConfiguration: {
            ResourceArn: arn,
            LogDestinationConfigs: [logGroupArn],
          },
        })
      );
    }
  };
}
