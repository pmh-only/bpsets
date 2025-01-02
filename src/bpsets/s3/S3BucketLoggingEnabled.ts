import {
  S3Client,
  ListBucketsCommand,
  GetBucketLoggingCommand,
  PutBucketLoggingCommand,
} from '@aws-sdk/client-s3';
import { BPSet, BPSetMetadata, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class S3BucketLoggingEnabled implements BPSet {
  private readonly client = new S3Client({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: [],
  };

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'S3BucketLoggingEnabled',
    description: 'Ensures that S3 buckets have logging enabled.',
    priority: 2,
    priorityReason:
      'Enabling logging on S3 buckets provides audit and security capabilities.',
    awsService: 'S3',
    awsServiceCategory: 'Buckets',
    bestPracticeCategory: 'Logging',
    requiredParametersForFix: [
      {
        name: 'log-destination-bucket',
        description: 'The bucket where access logs should be stored.',
        default: '',
        example: 'my-log-bucket',
      },
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'GetBucketLoggingCommand',
        reason: 'Retrieves the logging configuration for the bucket.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'PutBucketLoggingCommand',
        reason: 'Enables logging on the bucket.',
      },
    ],
    adviseBeforeFixFunction:
      'Ensure the destination bucket for logs exists and has proper permissions for logging.',
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
    const buckets = await this.getBuckets();

    for (const bucket of buckets) {
      try {
        const response = await this.memoClient.send(
          new GetBucketLoggingCommand({ Bucket: bucket.Name! })
        );
        if (response.LoggingEnabled) {
          compliantResources.push(`arn:aws:s3:::${bucket.Name!}`);
        } else {
          nonCompliantResources.push(`arn:aws:s3:::${bucket.Name!}`);
        }
      } catch (error) {
        nonCompliantResources.push(`arn:aws:s3:::${bucket.Name!}`);
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    this.stats.status = 'CHECKING';

    await this.fixImpl(nonCompliantResources, requiredParametersForFix)
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

  private readonly fixImpl = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const logDestinationBucket = requiredParametersForFix.find(
      (param) => param.name === 'log-destination-bucket'
    )?.value;

    if (!logDestinationBucket) {
      throw new Error("Required parameter 'log-destination-bucket' is missing.");
    }

    for (const bucketArn of nonCompliantResources) {
      const bucketName = bucketArn.split(':::')[1]!;
      await this.client.send(
        new PutBucketLoggingCommand({
          Bucket: bucketName,
          BucketLoggingStatus: {
            LoggingEnabled: {
              TargetBucket: logDestinationBucket,
              TargetPrefix: `${bucketName}/logs/`,
            },
          },
        })
      );
    }
  };

  private readonly getBuckets = async () => {
    const response = await this.memoClient.send(new ListBucketsCommand({}));
    return response.Buckets || [];
  };
}
