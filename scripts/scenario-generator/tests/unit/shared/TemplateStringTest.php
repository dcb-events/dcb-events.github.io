<?php

declare(strict_types=1);

namespace Wwwision\DcbExampleGenerator\tests\unit\shared;

use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Wwwision\DcbExampleGenerator\shared\TemplateString;

#[CoversClass(TemplateString::class)]
final class TemplateStringTest extends TestCase
{

    public static function dataProvider_toJsTemplateString(): iterable
    {
        yield ['template' => 'no replacement', 'expected' => '"no replacement"'];
        yield ['template' => 'foo:{bar}', 'expected' => '`foo:${bar}`'];
        yield ['template' => '{foo}:{bar}', 'expected' => '`${foo}:${bar}`'];
        yield ['template' => '{foo}{bar}', 'expected' => '`${foo}${bar}`'];
        yield ['template' => '{foo}', 'expected' => 'foo'];
        yield ['template' => '{foo.bar}', 'expected' => 'foo.bar'];
    }

    #[DataProvider('dataProvider_toJsTemplateString')]
    public function test_toJsTemplateString(string $template, string $expected): void
    {
        $actualResult = TemplateString::parse($template)->toJsTemplateString();
        self::assertSame($expected, $actualResult);
    }
}