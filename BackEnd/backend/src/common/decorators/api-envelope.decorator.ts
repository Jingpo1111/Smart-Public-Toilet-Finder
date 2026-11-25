import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

const envelope = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data,
    ...extra,
    message: { type: 'string', example: 'Request completed successfully' },
  },
});

/** Documents `{ success, data: Model, message }`. */
export const ApiEnvelope = <T extends Type<unknown>>(model: T, description?: string) =>
  applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({ description, schema: envelope({ $ref: getSchemaPath(model) }) }),
  );

/** Documents `{ success, data: Model[], meta: { page, limit, total, totalPages }, message }`. */
export const ApiPaginatedEnvelope = <T extends Type<unknown>>(model: T, description?: string) =>
  applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      description,
      schema: envelope(
        { type: 'array', items: { $ref: getSchemaPath(model) } },
        {
          meta: {
            type: 'object',
            properties: {
              page: { type: 'integer', example: 1 },
              limit: { type: 'integer', example: 20 },
              total: { type: 'integer', example: 42 },
              totalPages: { type: 'integer', example: 3 },
            },
          },
        },
      ),
    }),
  );
