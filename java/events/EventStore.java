package events;

import java.util.concurrent.CompletableFuture;

public interface EventStore {

    EventSubscription subscribe(Query query, EventSubscriber subscriber);

    EventSubscription subscribe(Query query, EventSubscriber subscriber, ReadingOptions options);

    CompletableFuture<Void> append(Event[] events);

    CompletableFuture<Void> append(Event[] events, AppendCondition condition);

}
