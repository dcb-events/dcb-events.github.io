<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\commandHandlerDefinition;

use Closure;
use IteratorAggregate;
use Traversable;
use Wwwision\Types\Attributes\ListBased;

use function Wwwision\Types\instantiate;

/**
 * @implements IteratorAggregate<DecisionModel>
 */
#[ListBased(itemClassName: DecisionModel::class)]
final readonly class DecisionModels implements IteratorAggregate
{
    /**
     * @param array<DecisionModel> $decisionModels
     */
    private function __construct(
        private array $decisionModels,
    ) {}

    /**
     * @param array<DecisionModel> $decisionModels
     */
    public static function fromArray(array $decisionModels): self
    {
        return instantiate(self::class, $decisionModels);
    }

    public function getIterator(): Traversable
    {
        yield from array_values($this->decisionModels);
    }

    /**
     * @template T
     * @param Closure(DecisionModel): T $callback
     * @return array<T>
     */
    public function map(Closure $callback): array
    {
        return array_map($callback, $this->decisionModels);
    }
}
