import { useSuspenseQuery } from '@tanstack/react-query';
import { List, ListItem, Typography } from '@portal-poc/ds';
import { itemsListOptions, useRemoteHttp } from '@/shared/api';

export const HomePage = () => {
  const http = useRemoteHttp();
  const { data } = useSuspenseQuery(itemsListOptions(http));

  if (data.length === 0) {
    return <Typography level="body-sm">Nothing here yet.</Typography>;
  }
  return (
    <List>
      {data.map((item) => (
        <ListItem key={item.id}>{item.title}</ListItem>
      ))}
    </List>
  );
};
