import {
  S3Client,
  ListBucketsCommand,
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand
} from '@aws-sdk/client-s3'
import { BPSet } from '../../types'
import { Memorizer } from '../../Memorizer'

export class S3LifecyclePolicyCheck implements BPSet {
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
        await this.memoClient.send(
          new GetBucketLifecycleConfigurationCommand({ Bucket: bucket.Name! })
        )
        compliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
      } catch (error) {
        if ((error as any).name === 'NoSuchLifecycleConfiguration') {
          nonCompliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
        } else {
          throw error
        }
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [
        { name: 'lifecycle-policy-rule-id' },
        { name: 'expiration-days' }
      ]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ): Promise<void> => {
    const ruleId = requiredParametersForFix.find(
      param => param.name === 'lifecycle-policy-rule-id'
    )?.value
    const expirationDays = requiredParametersForFix.find(
      param => param.name === 'expiration-days'
    )?.value

    if (!ruleId || !expirationDays) {
      throw new Error(
        "Required parameters 'lifecycle-policy-rule-id' and/or 'expiration-days' are missing."
      )
    }

    for (const bucketArn of nonCompliantResources) {
      const bucketName = bucketArn.split(':::')[1]!
      await this.client.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: bucketName,
          LifecycleConfiguration: {
            Rules: [
              {
                ID: ruleId,
                Status: 'Enabled',
                Expiration: {
                  Days: parseInt(expirationDays, 10)
                }
              }
            ]
          }
        })
      )
    }
  }
}
