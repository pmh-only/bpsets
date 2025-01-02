import {
  S3Client,
  ListBucketsCommand,
  GetBucketPolicyCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3';
import { BPSet, BPSetMetadata, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class S3BucketSSLRequestsOnly implements BPSet {
  private readonly client = new S3Client({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: [],
  };

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'S3BucketSSLRequestsOnly',
    description: 'Ensures that all S3 bucket requests are made using SSL.',
    priority: 2,
    priorityReason: 'SSL ensures secure data transmission to and from S3 buckets.',
    awsService: 'S3',
    awsServiceCategory: 'Buckets',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'GetBucketPolicyCommand',
        reason: 'Retrieves the bucket policy to check for SSL conditions.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'PutBucketPolicyCommand',
        reason: 'Updates the bucket policy to enforce SSL requests.',
      },
    ],
    adviseBeforeFixFunction:
      'Ensure existing bucket policies will not conflict with the SSL-only policy.',
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
          new GetBucketPolicyCommand({ Bucket: bucket.Name! })
        );
        const policy = JSON.parse(response.Policy!);
        const hasSSLCondition = policy.Statement.some(
          (stmt: any) =>
            stmt.Condition &&
            stmt.Condition.Bool &&
            stmt.Condition.Bool['aws:SecureTransport'] === 'false'
        );

        if (hasSSLCondition) {
          compliantResources.push(`arn:aws:s3:::${bucket.Name!}`);
        } else {
          nonCompliantResources.push(`arn:aws:s3:::${bucket.Name!}`);
        }
      } catch (error) {
        if ((error as any).name === 'NoSuchBucketPolicy') {
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
          message: err.message,
        });
      });
  };

  private readonly fixImpl = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    for (const bucketArn of nonCompliantResources) {
      const bucketName = bucketArn.split(':::')[1]!;
      let existingPolicy: any;

      try {
        const response = await this.memoClient.send(
          new GetBucketPolicyCommand({ Bucket: bucketName })
        );
        existingPolicy = JSON.parse(response.Policy!);
      } catch (error) {
        if ((error as any).name !== 'NoSuchBucketPolicy') {
          throw error;
        }
      }

      const sslPolicyStatement = {
        Sid: 'DenyNonSSLRequests',
        Effect: 'Deny',
        Principal: '*',
        Action: 's3:*',
        Resource: [`arn:aws:s3:::${bucketName}/*`, `arn:aws:s3:::${bucketName}`],
        Condition: {
          Bool: {
            'aws:SecureTransport': 'false',
          },
        },
      };

      let updatedPolicy;
      if (existingPolicy) {
        existingPolicy.Statement.push(sslPolicyStatement);
        updatedPolicy = JSON.stringify(existingPolicy);
      } else {
        updatedPolicy = this.createSSLOnlyPolicy(bucketName);
      }

      await this.client.send(
        new PutBucketPolicyCommand({
          Bucket: bucketName,
          Policy: updatedPolicy,
        })
      );
    }
  };

  private readonly createSSLOnlyPolicy = (bucketName: string): string => {
    return JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'DenyNonSSLRequests',
          Effect: 'Deny',
          Principal: '*',
          Action: 's3:*',
          Resource: [`arn:aws:s3:::${bucketName}/*`, `arn:aws:s3:::${bucketName}`],
          Condition: {
            Bool: {
              'aws:SecureTransport': 'false',
            },
          },
        },
      ],
    });
  };

  private readonly getBuckets = async () => {
    const response = await this.memoClient.send(new ListBucketsCommand({}));
    return response.Buckets || [];
  };
}
