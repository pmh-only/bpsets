import {
  S3Client,
  ListBucketsCommand,
  GetBucketEncryptionCommand,
  PutBucketEncryptionCommand
} from '@aws-sdk/client-s3'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class S3DefaultEncryptionKMS implements BPSet {
  private readonly client = new S3Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getBuckets = async () => {
    const response = await this.memoClient.send(new ListBucketsCommand({}))
    return response.Buckets || []
  }

  public readonly check = async (): Promise<{
    compliantResources: string[]
    nonCompliantResources: string[]
    requiredParametersForFix: { name: string }[]
  }> => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const buckets = await this.getBuckets()

    for (const bucket of buckets) {
      try {
        const response = await this.memoClient.send(
          new GetBucketEncryptionCommand({ Bucket: bucket.Name! })
        )
        const encryption = response.ServerSideEncryptionConfiguration!
        const isKmsEnabled = encryption.Rules?.some(
          rule =>
            rule.ApplyServerSideEncryptionByDefault &&
            rule.ApplyServerSideEncryptionByDefault.SSEAlgorithm === 'aws:kms'
        )

        if (isKmsEnabled) {
          compliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
        } else {
          nonCompliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
        }
      } catch (error) {
        if ((error as any).name === 'ServerSideEncryptionConfigurationNotFoundError') {
          nonCompliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
        } else {
          throw error
        }
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'kms-key-id' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ): Promise<void> => {
    const kmsKeyId = requiredParametersForFix.find(param => param.name === 'kms-key-id')?.value

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
}
