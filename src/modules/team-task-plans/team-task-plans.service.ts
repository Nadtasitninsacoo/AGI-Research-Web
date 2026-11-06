
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2';
import { DatabaseService } from '../../database/database.service.js';
import { CreateTeamTaskPlanDto } from './dto/create-team-task-plan.dto.js';

interface UserRow extends RowDataPacket {
  id: number;
}

interface AgentRow extends RowDataPacket {
  id: number;
}

interface SavedIpRow extends RowDataPacket {
  ip: string;
}

interface SavedPortRow extends RowDataPacket {
  ip: string;
  port: number;
}

interface CreatedPlan {
  id: number;
  name: string;
  status: 'draft';
}

@Injectable()
export class TeamTaskPlansService {
  constructor(private readonly database: DatabaseService) {}

  async create(dto: CreateTeamTaskPlanDto): Promise<CreatedPlan> {
    const connection = await this.database.pool.getConnection();

    try {
      await connection.beginTransaction();

      // The shared API token does not identify an individual user.
      // Allow creation only when exactly one user exists.
      const [users] = await connection.query<UserRow[]>(
        'SELECT id FROM users LIMIT 2',
      );

      if (users.length !== 1) {
        throw new ConflictException(
          'Cannot determine the plan owner. Exactly one user must exist.',
        );
      }

      const createdBy = users[0].id;

      // Reject duplicate targets.
      const targetKeys = dto.targets.map((target) =>
        target.targetType === 'ip'
          ? `ip:${target.ip}`
          : `port:${target.ip}:${target.port}`,
      );

      if (new Set(targetKeys).size !== targetKeys.length) {
        throw new BadRequestException('Duplicate targets are not allowed.');
      }

      // Validate selected agents.
      const placeholders = dto.agentIds.map(() => '?').join(', ');

      const [agents] = await connection.query<AgentRow[]>(
        `SELECT id FROM agents WHERE id IN (${placeholders})`,
        dto.agentIds,
      );

      if (agents.length !== dto.agentIds.length) {
        throw new NotFoundException(
          'One or more selected agents do not exist.',
        );
      }

      // Validate targets against saved database records.
      for (const target of dto.targets) {
        if (target.targetType === 'ip') {
          if (target.port !== undefined) {
            throw new BadRequestException(
              'IP targets must not contain a port.',
            );
          }

          const [savedIps] = await connection.query<SavedIpRow[]>(
            'SELECT ip FROM saved_ips WHERE ip = ? LIMIT 1',
            [target.ip],
          );

          if (savedIps.length === 0) {
            throw new NotFoundException(
              `IP target ${target.ip} was not found in saved_ips.`,
            );
          }
        } else {
          if (target.port === undefined) {
            throw new BadRequestException(
              'Port targets require a port number.',
            );
          }

          const [savedPorts] = await connection.query<SavedPortRow[]>(
            'SELECT ip, port FROM saved_ports WHERE ip = ? AND port = ? LIMIT 1',
            [target.ip, target.port],
          );

          if (savedPorts.length === 0) {
            throw new NotFoundException(
              `Port ${target.port} for ${target.ip} was not found in saved_ports.`,
            );
          }
        }
      }

      // Create the plan.
      const [planResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO team_task_plans
          (created_by, name, description, status)
         VALUES (?, ?, ?, 'draft')`,
        [createdBy, dto.name, dto.description ?? null],
      );

      const planId = planResult.insertId;

      // Save targets.
      for (const target of dto.targets) {
        await connection.execute<ResultSetHeader>(
          `INSERT INTO team_task_plan_targets
            (plan_id, target_type, ip, port, service)
           VALUES (?, ?, ?, ?, ?)`,
          [
            planId,
            target.targetType,
            target.ip,
            target.targetType === 'port' ? target.port : null,
            target.service ?? null,
          ],
        );
      }

      // Assign agents to the plan.
      for (const agentId of dto.agentIds) {
        await connection.execute<ResultSetHeader>(
          `INSERT INTO team_task_plan_agents
            (plan_id, agent_id, role)
           VALUES (?, ?, 'worker')`,
          [planId, agentId],
        );
      }

      await connection.commit();

      return {
        id: planId,
        name: dto.name,
        status: 'draft',
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}