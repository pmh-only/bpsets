import {
  DescribeInstancesCommand,
  EC2Client,
  ModifyInstanceMetadataOptionsCommand,
} from '@aws-sdk/client-ec2';
import { BPSet, BPSetFixFn, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class EC2Imdsv2Check implements BPSet {
  private readonly client = new EC2Client({});
  private readonly memoClient = Memorizer.memo(this.client);

  public readonly getMetadata = () => ({
    name: 'EC2Imdsv2Check',
    description: 'Ensures that EC2 instances enforce the use of IMDSv2 for enhanced metadata security.',
    priority: 1,
    priorityReason: 'Requiring IMDSv2 improves the security of instance metadata by mitigating SSRF attacks.',
    awsService: 'EC2',
    awsServiceCategory: 'Compute',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeInstancesCommand',
        reason: 'Retrieve all EC2 instances and check their metadata options.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'ModifyInstanceMetadataOptionsCommand',
        reason: 'Update EC2 instance metadata options to enforce IMDSv2.',
      },
    ],
    adviseBeforeFixFunction: 'Ensure modifying metadata options aligns with operational policies.',
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
    const response = await this.memoClient.send(new DescribeInstancesCommand({}));

    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        if (instance.State?.Name === 'terminated')
          continue

        if (instance.MetadataOptions?.HttpTokens === 'required') {
          compliantResources.push(instance.InstanceId!);
        } else {
          nonCompliantResources.push(instance.InstanceId!);
        }
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

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources) => {
    for (const instanceId of nonCompliantResources) {
      await this.client.send(
        new ModifyInstanceMetadataOptionsCommand({
          InstanceId: instanceId,
          HttpTokens: 'required',
        })
      );
    }
  };
}
