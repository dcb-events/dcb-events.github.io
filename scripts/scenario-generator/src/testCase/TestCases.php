<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\testCase;

use Closure;
use IteratorAggregate;
use Traversable;
use Wwwision\Types\Attributes\ListBased;

use function Wwwision\Types\instantiate;

/**
 * @implements IteratorAggregate<TestCase>
 */
#[ListBased(itemClassName: TestCase::class)]
final readonly class TestCases implements IteratorAggregate
{
    /**
     * @param array<TestCase> $testCases
     */
    private function __construct(
        private array $testCases,
    ) {}

    /**
     * @param array<TestCase> $testCases
     */
    public static function fromArray(array $testCases): self
    {
        return instantiate(self::class, $testCases);
    }

    public static function none(): self
    {
        return self::fromArray([]);
    }

    public function getIterator(): Traversable
    {
        yield from array_values($this->testCases);
    }

    /**
     * @template T
     * @param Closure(TestCase): T $callback
     * @return array<T>
     */
    public function map(Closure $callback): array
    {
        return array_map($callback, $this->testCases);
    }

    /**
     * @return array<string>
     */
    public function descriptions(): array
    {
        return $this->map(static fn(TestCase $testCase) => $testCase->description);
    }

    public function merge(self $other): self
    {
        return self::fromArray(array_merge(
            array_filter($this->testCases, static fn(TestCase $testCase) => !in_array($testCase->description, $other->descriptions())),
            $other->testCases,
        ));
    }
}
