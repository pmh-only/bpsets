import {
  RDSClient,
  DescribeDBClusterSnapshotsCommand,
  CopyDBClusterSnapshotCommand
} from '@aws-sdk/client-rds'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class RDSSnapshotEncrypted implements BPSet {
  private readonly client = new RDSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getDBClusterSnapshots = async () => {
    const response = await this.memoClient.send(new DescribeDBClusterSnapshotsCommand({}))
    return response.DBClusterSnapshots || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const snapshots = await this.getDBClusterSnapshots()

    for (const snapshot of snapshots) {
      if (snapshot.StorageEncrypted) {
        compliantResources.push(snapshot.DBClusterSnapshotArn!)
      } else {
        nonCompliantResources.push(snapshot.DBClusterSnapshotArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [
        { name: 'kms-key-id', value: '<KMS_KEY_ID>' } // Replace with your KMS key ID
      ]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const kmsKeyId = requiredParametersForFix.find(param => param.name === 'kms-key-id')?.value

    if (!kmsKeyId) {
      throw new Error("Required parameter 'kms-key-id' is missing.")
    }

    for (const arn of nonCompliantResources) {
      const snapshotId = arn.split(':snapshot:')[1]

      await this.client.send(
        new CopyDBClusterSnapshotCommand({
          SourceDBClusterSnapshotIdentifier: arn,
          TargetDBClusterSnapshotIdentifier: `${snapshotId}-encrypted`,
          KmsKeyId: kmsKeyId
        })
      )
    }
  }
}
