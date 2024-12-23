import {
  S3Client,
  ListBucketsCommand,
  GetBucketPolicyCommand,
  PutBucketPolicyCommand
} from '@aws-sdk/client-s3'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class S3BucketSSLRequestsOnly implements BPSet {
  private readonly client = new S3Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getBuckets = async () => {
    const response = await this.memoClient.send(new ListBucketsCommand({}))
    return response.Buckets || []
  }

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
              'aws:SecureTransport': 'false'
            }
          }
        }
      ]
    })
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
          new GetBucketPolicyCommand({ Bucket: bucket.Name! })
        )
        const policy = JSON.parse(response.Policy!)
        const hasSSLCondition = policy.Statement.some(
          (stmt: any) =>
            stmt.Condition &&
            stmt.Condition.Bool &&
            stmt.Condition.Bool['aws:SecureTransport'] === 'false'
        )

        if (hasSSLCondition) {
          compliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
        } else {
          nonCompliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
        }
      } catch (error) {
        if ((error as any).name === 'NoSuchBucketPolicy') {
          nonCompliantResources.push(`arn:aws:s3:::${bucket.Name!}`)
        } else {
          throw error
        }
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ): Promise<void> => {
    for (const bucketArn of nonCompliantResources) {
      const bucketName = bucketArn.split(':::')[1]!
      let existingPolicy: any

      try {
        const response = await this.memoClient.send(
          new GetBucketPolicyCommand({ Bucket: bucketName })
        )
        existingPolicy = JSON.parse(response.Policy!)
      } catch (error) {
        if ((error as any).name !== 'NoSuchBucketPolicy') {
          throw error
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
            'aws:SecureTransport': 'false'
          }
        }
      }

      let updatedPolicy
      if (existingPolicy) {
        existingPolicy.Statement.push(sslPolicyStatement)
        updatedPolicy = JSON.stringify(existingPolicy)
      } else {
        updatedPolicy = this.createSSLOnlyPolicy(bucketName)
      }

      await this.client.send(
        new PutBucketPolicyCommand({
          Bucket: bucketName,
          Policy: updatedPolicy
        })
      )
    }
  }
}
