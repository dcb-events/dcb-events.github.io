<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator;

use RuntimeException;
use Wwwision\DcbExampleGenerator\shared\TemplateString;
use Wwwision\Types\Schema\OneOfSchema;
use Wwwision\TypesJSONSchema\Types\AllOfSchema;
use Wwwision\TypesJSONSchema\Types\AnyOfSchema;
use Wwwision\TypesJSONSchema\Types\ArraySchema;
use Wwwision\TypesJSONSchema\Types\BooleanSchema;
use Wwwision\TypesJSONSchema\Types\IntegerSchema;
use Wwwision\TypesJSONSchema\Types\NotSchema;
use Wwwision\TypesJSONSchema\Types\NullSchema;
use Wwwision\TypesJSONSchema\Types\NumberSchema;
use Wwwision\TypesJSONSchema\Types\ObjectSchema;
use Wwwision\TypesJSONSchema\Types\ReferenceSchema;
use Wwwision\TypesJSONSchema\Types\Schema;
use Wwwision\TypesJSONSchema\Types\StringSchema;

final readonly class GeneratorTS
{
    public function __construct(
        private Example $example,
    ) {}

    public function generate(): string
    {
        return
            $this->imports() . self::lb() .
            '// event type definitions:' . self::lb() . self::lb() .
            $this->eventTypeDefinitions() . self::lb() .
            '// decision models:' . self::lb() . self::lb() .
            $this->decisionModels() . self::lb() .
            '// command handlers:' . self::lb() . self::lb() .
            $this->commandHandlers() . self::lb()
        ;
    }

    private function imports(): string
    {
        return 'import { Tags, DcbEvent, EventHandlerWithState, buildDecisionModel, EventStore } from "@dcb-es/event-store"' . self::lb();
    }

    private function eventTypeDefinitions(): string
    {
        $result = '';
        foreach ($this->example->eventDefinitions as $eventTypeDefinition) {
            $result .= 'export class ' . $eventTypeDefinition->name . ' implements DcbEvent {' . self::lb();
            $result .= '  public type = "' . lcfirst($eventTypeDefinition->name) . '" as const' . self::lb();
            $result .= '  public tags: Tags' . self::lb();
            $result .= '  public data: ' . self::schemaToTypeDefinition($eventTypeDefinition->schema) . self::lb() . self::lb();
            $result .= '  constructor({ ' . self::schemaToValueAssignment($eventTypeDefinition->schema) . ' }: ' . self::schemaToTypeDefinition($eventTypeDefinition->schema) . ') {' . self::lb();
            $result .= '    this.tags = ' . self::tagResolvers($eventTypeDefinition->tagResolvers) . self::lb();
            $result .= '    this.data = { ' . self::schemaToValueAssignment($eventTypeDefinition->schema) . ' }' . self::lb();
            $result .= '  }' . self::lb();
            $result .= '}' . self::lb();
        }
        return $result;
    }

    /**
     * @param array<string> $tagResolvers
     */
    private static function tagResolvers(array $tagResolvers): string
    {
        $parts = [];
        foreach ($tagResolvers as $tagResolver) {
            // HACK
            $tagResolver = str_replace('{data.', '{', $tagResolver);
            $parts[] = TemplateString::parse($tagResolver)->toJsTemplateString();
        }
        return 'Tags.from([' . implode(', ', $parts) . '])';
    }

    private static function schemaToValueAssignment(Schema $schema): string
    {
        if (!$schema instanceof ObjectSchema) {
            throw new RuntimeException(sprintf('Only object schemas can be converted to value assignment code, got: %s', $schema::class));
        }
        return implode(', ', $schema->properties->names());
    }

    private static function schemaToParameters(Schema $schema): string
    {
        if (!$schema instanceof ObjectSchema) {
            throw new RuntimeException(sprintf('Only object schemas can be converted to parameter code, got: %s', $schema::class));
        }
        $parts = [];
        foreach ($schema->properties as $propertyName => $propertySchema) {
            $parts[] = $propertyName . ': ' . self::schemaToTypeDefinition($propertySchema);
        }
        return implode(', ', $parts);
    }

    private static function schemaToTypeDefinition(Schema $schema): string
    {
        return match ($schema::class) {
            AllOfSchema::class => 'TODO',
            AnyOfSchema::class => 'TODO',
            ArraySchema::class => 'TODO',
            BooleanSchema::class => 'boolean',
            IntegerSchema::class, NumberSchema::class => 'number',
            NotSchema::class => '!' . self::schemaToTypeDefinition($schema->schema),
            NullSchema::class => 'null',
            ObjectSchema::class => self::objectSchemaToTypeDefinition($schema),
            OneOfSchema::class => 'TODO',
            ReferenceSchema::class => 'TODO',
            StringSchema::class => 'string',

            default => throw new RuntimeException(sprintf('Unsupported schema type: %s', $schema::class))
        };
    }

    private static function objectSchemaToTypeDefinition(ObjectSchema $schema): string
    {
        $parts = [];
        foreach ($schema->properties as $propertyName => $propertySchema) {
            $parts[] = $propertyName . ': ' . self::schemaToTypeDefinition($propertySchema);
        }
        return '{ ' . implode('; ', $parts) . ' }';
    }

    private function decisionModels(): string
    {
        $result = '';
        foreach ($this->example->projections as $projection) {
            $result .= 'export const ' . ucfirst($projection->name) . ' = (' . self::schemaToParameters($projection->parameterSchema) . '): EventHandlerWithState<' . self::eventTypes($projection->handlers->eventTypes()) . ', ' . self::schemaToTypeDefinition($projection->stateSchema) . '> => ({' . self::lb();
            $result .= '  tagFilter: ' . self::tagResolvers($projection->tagFilters) . ',' . self::lb();
            $result .= '  init: ' . json_encode($projection->stateSchema->default, JSON_THROW_ON_ERROR) . ',' . self::lb();
            $result .= '  when: {' . self::lb();
            foreach ($projection->handlers as $handlerName => $handler) {
                $params = [];
                // HACK
                if (str_contains($handler->value, 'event')) {
                    $params[] = '{ event }';
                } else {
                    $params[] = '{}';
                }
                if (str_contains($handler->value, 'state')) {
                    $params[] = 'state';
                }
                // /HACK
                $result .= '    ' . lcfirst($handlerName) . ': (' . implode(', ', $params) . ') => ' . $handler->value . ','  . self::lb();
            }
            $result .= '  },' . self::lb();
            $result .= '})' . self::lb();
        }
        return $result;
    }

    /**
     * @param array<string> $eventTypes
     */
    private static function eventTypes(array $eventTypes): string
    {
        $parts = [];
        foreach ($eventTypes as $eventType) {
            $parts[] = ucfirst($eventType);
        }
        return implode(' | ', $parts);
    }

    private function commandHandlers(): string
    {
        $result = 'export class Api {' . self::lb();
        $result .= '  private eventStore: EventStore' . self::lb();
        $result .= '  constructor(eventStore: EventStore) {' . self::lb();
        $result .= '      this.eventStore = eventStore' . self::lb();
        $result .= '  }' . self::lb() . self::lb();
        foreach ($this->example->commandHandlerDefinitions as $commandHandler) {
            $command = $this->example->commandDefinitions->get($commandHandler->commandName);
            $result .= '  async ' . lcfirst($commandHandler->commandName) . '(command: ' . self::schemaToTypeDefinition($command->schema) . ') {' . self::lb();
            $result .= '    const { state, appendCondition } = await buildDecisionModel(this.eventStore, {' . self::lb();
            foreach ($commandHandler->decisionModels as $decisionModel) {
                $result .= '      ' . lcfirst($decisionModel->name) . ': ' . ucfirst($decisionModel->name) . '(' . implode(', ', $decisionModel->parameters) . '),' . self::lb();
            }
            $result .= '    })' . self::lb();
            foreach ($commandHandler->constraintChecks as $constraintCheck) {
                $result .= '    if (' . $constraintCheck->condition . ') throw new Error(' . TemplateString::parse($constraintCheck->errorMessage)->toJsTemplateString() . ')' . self::lb();
            }
            $result .= '    await this.eventStore.append(' . self::lb();
            $result .= '      new ' . ucfirst($commandHandler->successEvent->type) . '({ ' . self::convertEventData($commandHandler->successEvent->data) . ' }),' . self::lb();
            $result .= '      appendCondition' . self::lb();
            $result .= '    )' . self::lb();
            $result .= '  }' . self::lb();
        }
        $result .= '}' . self::lb();
        return $result;
    }

    /**
     * @param array<string, mixed> $eventData
     */
    private static function convertEventData(array $eventData): string
    {
        $parts = [];
        foreach ($eventData as $key => $value) {
            $parts[] = $key . ': ' . TemplateString::parse($value)->toJsTemplateString();
        }
        return implode(', ', $parts);
    }

    private static function lb(): string
    {
        return chr(10);
    }

}
