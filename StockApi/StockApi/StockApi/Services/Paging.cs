using Microsoft.EntityFrameworkCore;

namespace StockApi.Services;

// One page of a list. The screen shows Items and builds its page buttons from Total.
public record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize)
{
    public int TotalPages => PageSize <= 0 ? 0 : (int)Math.Ceiling(Total / (double)PageSize);
    public PagedResult<TOut> Map<TOut>(Func<T, TOut> f) => new(Items.Select(f).ToList(), Total, Page, PageSize);
}

public static class Paging
{
    public const int DefaultSize = 20;
    public const int MaxSize = 100;

    public static (int Page, int Size) Normalize(int? page, int? pageSize) =>
        (Math.Max(page ?? 1, 1), Math.Clamp(pageSize ?? DefaultSize, 1, MaxSize));

    // The query must already have an ORDER BY, otherwise pages can repeat or skip rows.
    public static async Task<PagedResult<T>> ToPagedAsync<T>(this IQueryable<T> query, int? page, int? pageSize,
        CancellationToken ct = default)
    {
        var (p, size) = Normalize(page, pageSize);
        var total = await query.CountAsync(ct);
        var items = await query.Skip((p - 1) * size).Take(size).ToListAsync(ct);
        return new PagedResult<T>(items, total, p, size);
    }
}
