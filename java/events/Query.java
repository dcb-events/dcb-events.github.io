package events;

public interface Query extends Iterable<QueryItem> { }


interface QueryItem {

    String type();
    String[] tags();

}