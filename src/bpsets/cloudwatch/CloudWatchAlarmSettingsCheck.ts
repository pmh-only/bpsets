import {
  CloudWatchClient,
  DescribeAlarmsCommand,
  PutMetricAlarmCommand,
} from '@aws-sdk/client-cloudwatch';
import { BPSet, BPSetFixFn, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class CloudWatchAlarmSettingsCheck implements BPSet {
  private readonly client = new CloudWatchClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly getAlarms = async () => {
    const response = await this.memoClient.send(new DescribeAlarmsCommand({}));
    return response.MetricAlarms || [];
  };

  public readonly getMetadata = () => ({
    name: 'CloudWatchAlarmSettingsCheck',
    description: 'Ensures that CloudWatch alarms have the required settings configured.',
    priority: 3,
    priorityReason: 'Correct alarm settings are essential for effective monitoring and alerting.',
    awsService: 'CloudWatch',
    awsServiceCategory: 'Monitoring',
    bestPracticeCategory: 'Configuration',
    requiredParametersForFix: [
      { name: 'metric-name', description: 'The metric name for the alarm.', default: '', example: 'CPUUtilization' },
      { name: 'threshold', description: 'The threshold for the alarm.', default: '', example: '80' },
      { name: 'evaluation-periods', description: 'Number of evaluation periods for the alarm.', default: '', example: '5' },
      { name: 'period', description: 'The period in seconds for the metric evaluation.', default: '', example: '60' },
      { name: 'comparison-operator', description: 'Comparison operator for the threshold.', default: '', example: 'GreaterThanThreshold' },
      { name: 'statistic', description: 'Statistic to apply to the metric.', default: '', example: 'Average' },
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeAlarmsCommand',
        reason: 'Retrieve all CloudWatch alarms to verify their settings.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'PutMetricAlarmCommand',
        reason: 'Update or create alarms with the required settings.',
      },
    ],
    adviseBeforeFixFunction: 'Ensure the required settings are correctly configured for your monitoring needs.',
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
    const alarms = await this.getAlarms();
    const parameters = {
      MetricName: '', // Required
      Threshold: null,
      EvaluationPeriods: null,
      Period: null,
      ComparisonOperator: null,
      Statistic: null,
    };

    for (const alarm of alarms) {
      let isCompliant = true;

      for (const key of Object.keys(parameters).filter((k) => (parameters as any)[k] !== null)) {
        if (alarm[key as keyof typeof alarm] !== parameters[key as keyof typeof parameters]) {
          isCompliant = false;
          break;
        }
      }

      if (isCompliant) {
        compliantResources.push(alarm.AlarmArn!);
      } else {
        nonCompliantResources.push(alarm.AlarmArn!);
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
    const requiredSettings = Object.fromEntries(
      requiredParametersForFix.map((param) => [param.name, param.value])
    );

    for (const alarmArn of nonCompliantResources) {
      const alarmName = alarmArn.split(':').pop()!;

      await this.client.send(
        new PutMetricAlarmCommand({
          AlarmName: alarmName,
          MetricName: requiredSettings['metric-name'],
          Threshold: parseFloat(requiredSettings['threshold']),
          EvaluationPeriods: parseInt(requiredSettings['evaluation-periods'], 10),
          Period: parseInt(requiredSettings['period'], 10),
          ComparisonOperator: requiredSettings['comparison-operator'] as any,
          Statistic: requiredSettings['statistic'] as any,
        })
      );
    }
  };
}
