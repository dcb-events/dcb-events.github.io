<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\commandDefinition;

use Wwwision\TypesJSONSchema\Types\Schema;

final readonly class CommandDefinition
{
    public function __construct(
        public string $name,
        public Schema $schema,
    ) {}
}
