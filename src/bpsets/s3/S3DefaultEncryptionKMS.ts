import {
  S3Client,
  ListBucketsCommand,
  GetBucketEncryptionCommand,
  PutBucketEncryptionCommand
} from '@aws-sdk/client-s3'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class S3DefaultEncryptionKMS implements BPSet {
  private readonly client = new S3Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'S3DefaultEncryptionKMS',
    description: 'Ensures that all S3 buckets have default encryption enabled using AWS KMS.',
    priority: 1,
    priorityReason: 'Default encryption protects sensitive data stored in S3 buckets.',
    awsService: 'S3',
    awsServiceCategory: 'Buckets',
    bestPracticeCategory: 'Data Protection',
    requiredParametersForFix: [
      {
        name: 'kms-key-id',
        description: 'The KMS Key ID used for bucket encryption.',
        default: '',
        example: 'arn:aws:kms:us-east-1:123456789012:key/abcd1234-5678-90ab-cdef-EXAMPLE12345'
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'GetBucketEncryptionCommand',
        reason: 'Retrieve the encryption configuration for a bucket.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'PutBucketEncryptionCommand',
        reason: 'Enable KMS encryption for the bucket.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure the KMS key is properly configured with necessary permissions for S3 operations.'
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
    const buckets = await this.getBuckets()

    for (const bucket of buckets) {
      try {
        const response = await this.memoClient.send(new GetBucketEncryptionCommand({ Bucket: bucket.Name! }))
        const encryption = response.ServerSideEncryptionConfiguration!
        const isKmsEnabled = encryption.Rules?.some(
          (rule) =>
            rule.ApplyServerSideEncryptionByDefault &&
            rule.ApplyServerSideEncryptionByDefault.SSEAlgorithm === 'aws:kms'
        )

        if (isKmsEnabled) {
          compliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
        } else {
          nonCompliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
        }
      } catch (error) {
        if ((error as Error).name === 'ServerSideEncryptionConfigurationNotFoundError') {
          nonCompliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
        } else {
          throw error
        }
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    this.stats.status = 'CHECKING'

    await this.fixImpl(nonCompliantResources, requiredParametersForFix)
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
    const kmsKeyId = requiredParametersForFix.find((param) => param.name === 'kms-key-id')?.value

    if (!kmsKeyId) {
      throw new Error("Required parameter 'kms-key-id' is missing.")
    }

    for (const bucketArn of nonCompliantResources) {
      const bucketName = bucketArn.split(':::')[1]!
      await this.client.send(
        new PutBucketEncryptionCommand({
          Bucket: bucketName,
          ServerSideEncryptionConfiguration: {
            Rules: [
              {
                ApplyServerSideEncryptionByDefault: {
                  SSEAlgorithm: 'aws:kms',
                  KMSMasterKeyID: kmsKeyId
                }
              }
            ]
          }
        })
      )
    }
  }

  private readonly getBuckets = async () => {
    const response = await this.memoClient.send(new ListBucketsCommand({}))
    return response.Buckets || []
  }
}
