<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\projection;

use Wwwision\TypesJSONSchema\Types\Schema;

final readonly class Projection
{
    /**
     * @param array<string>|null $tagFilters array in the form ['`string-with-placeholders`'] (e.g. ['`course:${courseId}`'])
     */
    public function __construct(
        public string $name,
        public Schema|null $parameterSchema,
        public Schema $stateSchema,
        public ProjectionHandlers $handlers,
        public array|null $tagFilters = null,
        public bool $onlyLastEvent = false,
    ) {}
}
