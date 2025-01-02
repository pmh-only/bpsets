import {
  CloudFrontClient,
  ListDistributionsCommand,
  GetDistributionCommand,
  UpdateDistributionCommand,
} from '@aws-sdk/client-cloudfront';
import { BPSet, BPSetFixFn, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class CloudFrontS3OriginAccessControlEnabled implements BPSet {
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
    name: 'CloudFrontS3OriginAccessControlEnabled',
    description: 'Ensures that CloudFront distributions with S3 origins have Origin Access Control (OAC) enabled.',
    priority: 3,
    priorityReason: 'Using Origin Access Control enhances security by ensuring only CloudFront can access the S3 origin.',
    awsService: 'CloudFront',
    awsServiceCategory: 'CDN',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [
      {
        name: 'origin-access-control-id',
        description: 'The ID of the Origin Access Control to associate with the S3 origin.',
        default: '',
        example: 'oac-0abcd1234efgh5678',
      },
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListDistributionsCommand',
        reason: 'List all CloudFront distributions to check for S3 origins.',
      },
      {
        name: 'GetDistributionCommand',
        reason: 'Retrieve distribution details to verify Origin Access Control configuration.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateDistributionCommand',
        reason: 'Enable Origin Access Control for S3 origins in the distribution.',
      },
    ],
    adviseBeforeFixFunction: 'Ensure the specified Origin Access Control is correctly configured and applied to the S3 bucket.',
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
      const hasNonCompliantOrigin = details.DistributionConfig?.Origins?.Items?.some(
        (origin) =>
          origin.S3OriginConfig &&
          (!origin.OriginAccessControlId || origin.OriginAccessControlId === '')
      );

      if (hasNonCompliantOrigin) {
        nonCompliantResources.push(details.ARN!);
      } else {
        compliantResources.push(details.ARN!);
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
    const originAccessControlId = requiredParametersForFix.find(
      (param) => param.name === 'origin-access-control-id'
    )?.value;

    if (!originAccessControlId) {
      throw new Error("Required parameter 'origin-access-control-id' is missing.");
    }

    for (const arn of nonCompliantResources) {
      const distributionId = arn.split('/').pop()!;
      const { distribution, etag } = await this.getDistributionDetails(distributionId);

      const updatedConfig = {
        ...distribution.DistributionConfig,
        Origins: {
          Items: distribution.DistributionConfig?.Origins?.Items?.map((origin) => {
            if (origin.S3OriginConfig) {
              return {
                ...origin,
                OriginAccessControlId: originAccessControlId,
              };
            }
            return origin;
          }),
        },
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
