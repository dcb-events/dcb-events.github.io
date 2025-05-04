<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\projection;

use Closure;
use IteratorAggregate;
use Traversable;
use Webmozart\Assert\Assert;
use Wwwision\Types\Attributes\ListBased;

use function Wwwision\Types\instantiate;

/**
 * @implements IteratorAggregate<Projection>
 */
#[ListBased(itemClassName: Projection::class)]
final readonly class Projections implements IteratorAggregate
{
    /**
     * @param array<Projection> $projections
     */
    private function __construct(
        private array $projections,
    ) {}

    /**
     * @param array<Projection> $projections
     */
    public static function fromArray(array $projections): self
    {
        return instantiate(self::class, $projections);
    }

    public static function none(): self
    {
        return self::fromArray([]);
    }

    public function getIterator(): Traversable
    {
        yield from array_values($this->projections);
    }

    /**
     * @template T
     * @param Closure(Projection): T $callback
     * @return array<T>
     */
    public function map(Closure $callback): array
    {
        return array_map($callback, $this->projections);
    }

    /**
     * @param Closure(Projection): bool $callback
     */
    public function filter(Closure $callback): self
    {
        return self::fromArray(array_filter($this->projections, $callback));
    }

    public function exists(string $projectionName): bool
    {
        return $this->findByName($projectionName) !== null;
    }

    public function only(string ...$projectionNames): self
    {
        return self::fromArray(array_filter($this->projections, static fn(Projection $projection) => in_array($projection->name, $projectionNames)));
    }

    public function get(string $projectionName): Projection
    {
        $candidate = $this->findByName($projectionName);
        Assert::notNull($candidate, sprintf('Unknown projection "%s"', $projectionName));
        return $candidate;
    }

    public function with(Projection $projection): self
    {
        return self::fromArray(array_merge(
            array_filter($this->projections, static fn(Projection $existingProjection) => $existingProjection->name !== $projection->name),
            [$projection],
        ));
    }





    private function findByName(string $projectionName): Projection|null
    {
        return array_find($this->projections, static fn(Projection $projection) => $projection->name === $projectionName);
    }

    /**
     * @return array<string>
     */
    public function names(): array
    {
        return $this->map(static fn(Projection $projection) => $projection->name);
    }

    public function merge(self $other): self
    {
        return self::fromArray(array_merge(
            array_filter($this->projections, static fn(Projection $projection) => !in_array($projection->name, $other->names())),
            $other->projections,
        ));
    }
}
