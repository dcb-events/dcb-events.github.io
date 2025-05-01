<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator;

use RuntimeException;
use Wwwision\DcbExampleGenerator\eventDefinition\EventDefinition;
use Wwwision\DcbExampleGenerator\fixture\Event;
use Wwwision\DcbExampleGenerator\projection\Projection;
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

use function Wwwision\Types\instantiate;

final readonly class GeneratorTS
{
    public function __construct(
        private Example $example,
    ) {}

    public function generate(): string
    {
        return
            '// event type definitions:' . self::lb() . self::lb() .
            $this->eventTypeDefinitions() . self::lb() .
            '// projections for decision models:' . self::lb() . self::lb() .
            $this->projections() . self::lb() .
            '// command handlers:' . self::lb() . self::lb() .
            $this->api()
        ;
    }

    private function eventTypeDefinitions(): string
    {
        $result = '';
        foreach ($this->example->eventDefinitions as $eventTypeDefinition) {
            $result .= 'class ' . $eventTypeDefinition->name . ' implements Event {' . self::lb();
            $result .= '  type = "' . $eventTypeDefinition->name . '" as const' . self::lb();
            $result .= '  tags: string[]' . self::lb();
            $tags = [];
            foreach ($eventTypeDefinition->tagResolvers as $tagResolver) {
                $tags[] = TemplateString::parse($tagResolver)->toJsTemplateString();
            }
            $result .= '  constructor(public readonly data: ' . self::schemaToTypeDefinition($eventTypeDefinition->schema) . ') {' . self::lb();
            $result .= '    this.tags = [' . implode(', ', $tags) . ']' . self::lb();
            $result .= '  }' . self::lb();
            $result .= '}' . self::lb() . self::lb();
        }
        $result .= 'type EventTypes = ' . implode(' | ', $this->example->eventDefinitions->map(fn (EventDefinition $eventDefinition) => $eventDefinition->name)) . self::lb() . self::lb();
        return $result;
    }

    private function projections(): string
    {
        $result = '';
        foreach ($this->example->projections as $projection) {
            $result .= 'class ' . ucfirst($projection->name) . 'Projection' . ' {' . self::lb();
            $result .= '  static for(' . self::schemaToParameters($projection->parameterSchema) . ') {' . self::lb();
            $result .= '    return createProjection<EventTypes, ' . self::schemaToTypeDefinition($projection->stateSchema) . '>({' . self::lb();
            $result .= '      initialState: ' . json_encode($projection->stateSchema?->default, JSON_THROW_ON_ERROR) . ',' . self::lb();
            $result .= '      handlers: {' . self::lb();
            foreach ($projection->handlers as $eventType => $projectionHandler) {
                $result .= '        ' . $eventType . ': (state, event) => ' . $projectionHandler->value . ',' . self::lb();
            }
            $result .= '      },' . self::lb();
            if ($projection->tagFilters !== null) {
                $result .= '      tags: ' . $this->extractTagFiltersFromProjection($projection) . ',' . self::lb();
            }
            $result .= '    })' . self::lb();
            $result .= '  }' . self::lb();
            $result .= '}' . self::lb() . self::lb();
        }
        return $result;
    }



    private function api(): string
    {
        $result = 'class Api {' . self::lb();
        $result .= '  constructor(private eventStore: EventStore) {}' . self::lb() . self::lb();

        foreach ($this->example->commandHandlerDefinitions as $commandHandlerDefinition) {
            $commandDefinition = $this->example->commandDefinitions->get($commandHandlerDefinition->commandName);
            $result .= '  ' . $commandHandlerDefinition->commandName . '(command: ' . self::schemaToTypeDefinition($commandDefinition->schema) . ') {' . self::lb();
            $result .= '    const { state, appendCondition } = buildDecisionModel(this.eventStore, {' . self::lb();
            foreach ($commandHandlerDefinition->decisionModels as $decisionModel) {
                $result .= '      ' . $decisionModel->name . ': ' . ucfirst($decisionModel->name) . 'Projection.for(' . implode(', ', $decisionModel->parameters) . '),' . self::lb();
            }
            $result .= '    })' . self::lb();
            foreach ($commandHandlerDefinition->constraintChecks as $constraintCheck) {
                $result .= '    if (' . $constraintCheck->condition . ') {' . self::lb();
                $result .= '      throw new Error(' . TemplateString::parse($constraintCheck->errorMessage)->toJsTemplateString() . ')' . self::lb();
                $result .= '    }' . self::lb();
            }
            $result .= '    this.eventStore.append(' . self::lb();
            $result .= '      new ' . $commandHandlerDefinition->successEvent->type . '({' . self::lb();
            $parts = [];
            foreach ($commandHandlerDefinition->successEvent->data as $key => $value) {
                $parts[] = '        ' . $key . ': ' . TemplateString::parse($value)->toJsTemplateString();
            }
            $result .= implode(',' . self::lb(), $parts) . self::lb();
            $result .= '      }),' . self::lb();
            $result .= '      appendCondition' . self::lb();
            $result .= '    )' . self::lb();
            $result .= '  }' . self::lb() . self::lb();
        }
        $result .= '}' . self::lb();
        return $result;
    }

    private function extractTagFiltersFromProjection(Projection $projection): string
    {
        $tagFilters = [];
        foreach ($projection->tagFilters as $tagFilter) {
            $tagFilters[] = TemplateString::parse($tagFilter)->toJsTemplateString();
        }
        return '[' . implode(', ', $tagFilters) . ']';
    }

    private static function lb(): string
    {
        return chr(10);
    }

    private static function schemaToParameters(Schema $schema): string
    {
        if (!$schema instanceof ObjectSchema) {
            throw new RuntimeException(sprintf('Only object schemas can be converted to parameter code, got: %s', $schema::class));
        }
        $parts = [];
        foreach ($schema->properties ?? [] as $propertyName => $propertySchema) {
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
        foreach ($schema->properties ?? [] as $propertyName => $propertySchema) {
            $parts[] = $propertyName . ': ' . self::schemaToTypeDefinition($propertySchema);
        }
        return '{ ' . implode('; ', $parts) . ' }';
    }
}
