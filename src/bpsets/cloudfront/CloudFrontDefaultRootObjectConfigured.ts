import {
  CloudFrontClient,
  ListDistributionsCommand,
  GetDistributionCommand,
  UpdateDistributionCommand,
} from '@aws-sdk/client-cloudfront';
import { BPSet, BPSetFixFn, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class CloudFrontDefaultRootObjectConfigured implements BPSet {
  private readonly client = new CloudFrontClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly getDistributions = async () => {
    const response = await this.memoClient.send(new ListDistributionsCommand({}));
    return response.DistributionList?.Items || [];
  };

  private readonly getDistributionDetails = async (distributionId: string) => {
    const response = await this.memoClient.send(
      new GetDistributionCommand({ Id: distributionId })
    );
    return {
      distribution: response.Distribution!,
      etag: response.ETag!,
    };
  };

  public readonly getMetadata = () => ({
    name: 'CloudFrontDefaultRootObjectConfigured',
    description: 'Ensures that CloudFront distributions have a default root object configured.',
    priority: 3,
    priorityReason: 'A default root object ensures users access the correct content when navigating to the distribution domain.',
    awsService: 'CloudFront',
    awsServiceCategory: 'CDN',
    bestPracticeCategory: 'Configuration',
    requiredParametersForFix: [
      {
        name: 'default-root-object',
        description: 'The default root object for the CloudFront distribution.',
        default: '',
        example: 'index.html',
      },
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListDistributionsCommand',
        reason: 'List all CloudFront distributions to check for a default root object.',
      },
      {
        name: 'GetDistributionCommand',
        reason: 'Retrieve distribution details to verify the default root object setting.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateDistributionCommand',
        reason: 'Set the default root object for the CloudFront distribution.',
      },
    ],
    adviseBeforeFixFunction: 'Ensure the default root object exists in the origin to avoid 404 errors.',
  });

  private readonly stats: BPSetStats = {
    nonCompliantResources: [],
    compliantResources: [],
    status: 'LOADED',
    errorMessage: [],
  };

  public readonly getStats = () => this.stats;

  public readonly clearStats = () => {
    this.stats.compliantResources = [];
    this.stats.nonCompliantResources = [];
    this.stats.status = 'LOADED';
    this.stats.errorMessage = [];
  };

  public readonly check = async () => {
    this.stats.status = 'CHECKING';

    await this.checkImpl().then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message,
        });
      }
    );
  };

  private readonly checkImpl = async () => {
    const compliantResources: string[] = [];
    const nonCompliantResources: string[] = [];
    const distributions = await this.getDistributions();

    for (const distribution of distributions) {
      const { distribution: details } = await this.getDistributionDetails(distribution.Id!);
      if (details.DistributionConfig?.DefaultRootObject !== '') {
        compliantResources.push(details.ARN!);
      } else {
        nonCompliantResources.push(details.ARN!);
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix: BPSetFixFn = async (...args) => {
    await this.fixImpl(...args).then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message,
        });
      }
    );
  };

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources, requiredParametersForFix) => {
    const defaultRootObject = requiredParametersForFix.find(
      (param) => param.name === 'default-root-object'
    )?.value;

    if (!defaultRootObject) {
      throw new Error("Required parameter 'default-root-object' is missing.");
    }

    for (const arn of nonCompliantResources) {
      const distributionId = arn.split('/').pop()!;
      const { distribution, etag } = await this.getDistributionDetails(distributionId);

      const updatedConfig = {
        ...distribution.DistributionConfig,
        DefaultRootObject: defaultRootObject,
      };

      await this.client.send(
        new UpdateDistributionCommand({
          Id: distributionId,
          IfMatch: etag,
          DistributionConfig: updatedConfig as any,
        })
      );
    }
  };
}
