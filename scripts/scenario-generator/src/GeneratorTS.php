<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator;

use RuntimeException;
use Webmozart\Assert\Assert;
use Wwwision\DcbExampleGenerator\eventDefinition\EventDefinition;
use Wwwision\DcbExampleGenerator\projection\Projection;
use Wwwision\DcbExampleGenerator\shared\TemplateString;
use Wwwision\TypesJSONSchema\Types\AllOfSchema;
use Wwwision\TypesJSONSchema\Types\AnyOfSchema;
use Wwwision\TypesJSONSchema\Types\ArraySchema;
use Wwwision\TypesJSONSchema\Types\BooleanSchema;
use Wwwision\TypesJSONSchema\Types\IntegerSchema;
use Wwwision\TypesJSONSchema\Types\NotSchema;
use Wwwision\TypesJSONSchema\Types\NullSchema;
use Wwwision\TypesJSONSchema\Types\NumberSchema;
use Wwwision\TypesJSONSchema\Types\ObjectSchema;
use Wwwision\TypesJSONSchema\Types\OneOfSchema;
use Wwwision\TypesJSONSchema\Types\ReferenceSchema;
use Wwwision\TypesJSONSchema\Types\Schema;
use Wwwision\TypesJSONSchema\Types\StringSchema;

final class GeneratorTS
{
    private Output $output;

    public function __construct(
        private readonly Example $example,
        private MergeResult|null $mergeResult,
    ) {}

    public function generate(): Output
    {
        $this->output = new Output();
        $this->eventTypeDefinitions();
        $this->projections();
        $this->api();
        return $this->output;
    }

    private function eventTypeDefinitions(): void
    {
        $this->output->addLine('// event type definitions:');
        $this->output->addLine();
        foreach ($this->example->eventDefinitions as $eventTypeDefinition) {
            if ($this->mergeResult?->isNewEventDefinition($eventTypeDefinition)) {
                $this->output->startHighlighting();
            }
            $propertySchemas = self::objectSchemaProperties($eventTypeDefinition->schema);
            $this->output->addLine('function ' . $eventTypeDefinition->name . '({');
            foreach ($propertySchemas as $propertyName => $propertySchema) {
                $this->output->addLine('  ' . $propertyName . ',');
            }
            $this->output->addLine('} : {');
            foreach (self::objectSchemaProperties($eventTypeDefinition->schema) as $propertyName => $propertySchema) {
                $this->output->addLine('  ' . $propertyName . ': ' . self::schemaToTypeDefinition($propertySchema) . ',');
            }
            $this->output->addLine('}) {');
            $this->output->addLine('  return {');
            $this->output->addLine('    type: "' . $eventTypeDefinition->name . '" as const,');
            $this->output->addLine('    data: { ' . implode(', ', array_keys($propertySchemas)) . ' },');
            $tags = [];
            foreach ($eventTypeDefinition->tagResolvers as $tagResolver) {
                $tags[] = TemplateString::parse(str_replace('data.', '', $tagResolver))->toJsTemplateString();
            }
            $this->output->addLine('    tags: [' . implode(', ', $tags) . '],');
            $this->output->addLine('  }');
            $this->output->addLine('}');
            $this->output->endHighlighting();
            $this->output->addLine();
        }
        $numberOfEventTypes = count($this->example->eventDefinitions);
        if ($numberOfEventTypes === 1) {
            $this->output->addLine('type EventTypes = ReturnType<' . implode(' | ', $this->example->eventDefinitions->map(fn(EventDefinition $eventDefinition) => 'typeof ' . $eventDefinition->name)) . '>');
            $this->output->addLine();
        } elseif ($numberOfEventTypes > 1) {
            $this->output->addLine('type EventTypes = ReturnType<');
            foreach ($this->example->eventDefinitions as $eventDefinition) {
                $this->output->addLine('  | typeof ' . $eventDefinition->name . ',');
            }
            $this->output->addLine('>');
            $this->output->addLine();
        }
    }

    private function projections(): void
    {
        $this->output->addLine('// projections for decision models:');
        $this->output->addLine();
        foreach ($this->example->projections as $projection) {
            if ($this->mergeResult?->isNewProjection($projection)) {
                $this->output->startHighlighting();
            }
            $parametersCode = $projection->parameterSchema !== null ? self::schemaToParameters($projection->parameterSchema) : '';
            $this->output->addLine('function ' . ucfirst($projection->name) . 'Projection(' . $parametersCode . ') {');
            $this->output->addLine('  return createProjection<EventTypes, ' . self::schemaToTypeDefinition($projection->stateSchema) . '>({');
            $this->output->addLine('    initialState: ' . json_encode($projection->stateSchema->default ?? null, JSON_THROW_ON_ERROR) . ',');
            $this->output->addLine('    handlers: {');
            foreach ($projection->handlers as $eventType => $projectionHandler) {
                Assert::string($eventType);
                $this->output->addLine('      ' . $eventType . ': (state, event) => ' . $projectionHandler->value . ',');
            }
            $this->output->addLine('    },');
            if ($projection->tagFilters !== null) {
                $this->output->addLine('    tagFilter: ' . $this->extractTagFiltersFromProjection($projection) . ',');
            }
            $this->output->addLine('  })');
            $this->output->addLine('}');
            $this->output->endHighlighting();
            $this->output->addLine();
        }
    }



    private function api(): void
    {
        $this->output->addLine('// command handlers:');
        $this->output->addLine();
        $this->output->addLine('class Api {');
        $this->output->addLine('  constructor(private eventStore: EventStore) {}');

        foreach ($this->example->commandHandlerDefinitions as $commandHandlerDefinition) {
            $this->output->addLine();
            $commandDefinition = $this->example->commandDefinitions->get($commandHandlerDefinition->commandName);
            $this->output->addLine('  ' . $commandHandlerDefinition->commandName . '(command: ' . self::schemaToTypeDefinition($commandDefinition->schema) . ') {');
            $this->output->addLine('    const { state, appendCondition } = buildDecisionModel(this.eventStore, {');
            foreach ($commandHandlerDefinition->decisionModels as $decisionModel) {
                $this->output->addLine('      ' . $decisionModel->name . ': ' . ucfirst($decisionModel->name) . 'Projection(' . implode(', ', $decisionModel->parameters) . '),');
            }
            $this->output->addLine('    })');
            foreach ($commandHandlerDefinition->constraintChecks as $constraintCheck) {
                $this->output->addLine('    if (' . $constraintCheck->condition . ') {');
                $this->output->addLine('      throw new Error(' . TemplateString::parse($constraintCheck->errorMessage)->toJsTemplateString() . ')');
                $this->output->addLine('    }');
            }
            $this->output->addLine('    this.eventStore.append(');
            $this->output->addLine('      ' . $commandHandlerDefinition->successEvent->type . '({');
            foreach ($commandHandlerDefinition->successEvent->data as $key => $value) {
                Assert::string($key);
                Assert::string($value);
                $this->output->addLine('        ' . $key . ': ' . TemplateString::parse($value)->toJsTemplateString() . ',');
            }
            $this->output->addLine('      }),');
            $this->output->addLine('      appendCondition');
            $this->output->addLine('    )');
            $this->output->addLine('  }');
        }
        $this->output->addLine('}');
    }

    private function extractTagFiltersFromProjection(Projection $projection): string
    {
        $tagFilters = [];
        if ($projection->tagFilters === null) {
            return '[]';
        }
        foreach ($projection->tagFilters as $tagFilter) {
            $tagFilters[] = TemplateString::parse($tagFilter)->toJsTemplateString();
        }
        return '[' . implode(', ', $tagFilters) . ']';
    }

    private static function schemaToParameters(Schema $schema): string
    {
        if (!$schema instanceof ObjectSchema) {
            throw new RuntimeException(sprintf('Only object schemas can be converted to parameter code, got: %s', $schema::class));
        }
        $parts = [];
        foreach ($schema->properties ?? [] as $propertyName => $propertySchema) {
            Assert::string($propertyName);
            $parts[] = $propertyName . ': ' . self::schemaToTypeDefinition($propertySchema);
        }
        return implode(', ', $parts);
    }

    /**
     * @return array<string, Schema>
     */
    private static function objectSchemaProperties(Schema $schema): array
    {
        if (!$schema instanceof ObjectSchema) {
            throw new RuntimeException(sprintf('Only object schemas are supported, got: %s', $schema::class));
        }
        if ($schema->properties === null) {
            return [];
        }
        return iterator_to_array($schema->properties);
    }

    private static function schemaToTypeDefinition(Schema $schema): string
    {
        return match ($schema::class) {
            AllOfSchema::class, ReferenceSchema::class, OneOfSchema::class, ArraySchema::class, AnyOfSchema::class => 'TODO',
            BooleanSchema::class => 'boolean',
            IntegerSchema::class, NumberSchema::class => 'number',
            NotSchema::class => '!' . self::schemaToTypeDefinition($schema->schema),
            NullSchema::class => 'null',
            ObjectSchema::class => self::objectSchemaToTypeDefinition($schema),
            StringSchema::class => 'string',

            default => throw new RuntimeException(sprintf('Unsupported schema type: %s', $schema::class)),
        };
    }

    private static function objectSchemaToTypeDefinition(ObjectSchema $schema): string
    {
        $parts = [];
        foreach ($schema->properties ?? [] as $propertyName => $propertySchema) {
            Assert::string($propertyName);
            $parts[] = $propertyName . ': ' . self::schemaToTypeDefinition($propertySchema);
        }
        return '{ ' . implode('; ', $parts) . ' }';
    }
}
