import {
  S3Client,
  ListBucketsCommand,
  GetObjectLockConfigurationCommand,
  PutObjectLockConfigurationCommand
} from '@aws-sdk/client-s3';
import { BPSet, BPSetMetadata, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class S3BucketDefaultLockEnabled implements BPSet {
  private readonly client = new S3Client({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  };

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'S3BucketDefaultLockEnabled',
    description: 'Ensures that all S3 buckets have default object lock configuration enabled.',
    priority: 2,
    priorityReason: 'Object lock configuration ensures immutability of bucket objects, protecting them from unintended deletions or modifications.',
    awsService: 'S3',
    awsServiceCategory: 'Buckets',
    bestPracticeCategory: 'Data Protection',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'GetObjectLockConfigurationCommand',
        reason: 'Checks if the object lock configuration is enabled for the bucket.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'PutObjectLockConfigurationCommand',
        reason: 'Enables object lock configuration with a default retention rule.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure that the S3 bucket has object lock enabled before running the fix function, as this operation cannot be undone.'
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
          message: err.message
        });
      });
  };

  private readonly checkImpl = async () => {
    const compliantResources: string[] = [];
    const nonCompliantResources: string[] = [];
    const buckets = await this.getBuckets();

    for (const bucket of buckets) {
      try {
        await this.memoClient.send(
          new GetObjectLockConfigurationCommand({ Bucket: bucket.Name! })
        );
        compliantResources.push(`arn:aws:s3:::${bucket.Name!}`);
      } catch (error) {
        if ((error as any).name === 'ObjectLockConfigurationNotFoundError') {
          nonCompliantResources.push(`arn:aws:s3:::${bucket.Name!}`);
        } else {
          throw error;
        }
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
          message: err.message
        });
      });
  };

  private readonly fixImpl = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    for (const bucketArn of nonCompliantResources) {
      const bucketName = bucketArn.split(':::')[1]!;
      await this.client.send(
        new PutObjectLockConfigurationCommand({
          Bucket: bucketName,
          ObjectLockConfiguration: {
            ObjectLockEnabled: 'Enabled',
            Rule: {
              DefaultRetention: {
                Mode: 'GOVERNANCE',
                Days: 365
              }
            }
          }
        })
      );
    }
  };

  private readonly getBuckets = async () => {
    const response = await this.memoClient.send(new ListBucketsCommand({}));
    return response.Buckets || [];
  };
}
