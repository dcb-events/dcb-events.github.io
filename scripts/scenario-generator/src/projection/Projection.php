<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\projection;

use Wwwision\TypesJSONSchema\Types\Schema;

final readonly class Projection
{
    /**
     * @param array<string> $tagFilters array in the form ['`string-with-placeholders`'] (e.g. ['`course:${courseId}`'])
     */
    public function __construct(
        public string $name,
        public Schema $parameterSchema,
        public Schema $stateSchema,
        public ProjectionHandlers $handlers,
        public array $tagFilters,
    ) {}

    public function withStateSchema(Schema $stateSchema): self
    {
        return new self($this->name, $this->parameterSchema, $stateSchema, $this->handlers, $this->tagFilters);
    }

    public function withHandlers(ProjectionHandlers $handlers): self
    {
        return new self($this->name, $this->parameterSchema, $this->stateSchema, $handlers, $this->tagFilters);
    }
}
